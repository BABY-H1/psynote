"""
Upload API router — 镜像 ``server/src/modules/upload/upload.routes.ts``。

1 个 endpoint (挂在 ``/api/orgs/{org_id}/upload`` prefix, 与 Node ``app.ts:214`` 一致):
  POST /   — multipart 上传单文件, 落到 ``UPLOAD_DIR/{org_id}/{uuid}{.ext}``

权限链 (镜像 upload.routes.ts:8-10):
  - ``get_current_user``  必须登录
  - ``get_org_context``   必须是 org 成员 (path 参 ``org_id``)
  - rejectClient guard 没 port — Phase X 决策再补 (Node 是为了拦"客户端 portal 用户
    用 staff 路径上传"的旧路径; Python 端 Phase 3 阶段尚未引入 client portal)

存储:
  - ``UPLOAD_DIR`` 默认 ``D:/dev-cache/psynote-uploads`` (Windows 默认 D 盘缓存约定);
    生产 / Docker 通过 env var 覆盖到挂载卷。
  - 文件名: ``{uuid4}{原扩展名}`` (随机化防猜测/覆盖, 与 Node ``randomUUID()`` 一致)。
  - 返回的 ``url`` 仍走 Node 端 ``/uploads/{org_id}/{file}`` 形态, 让 Caddy 切流到 Python
    时静态 prefix 匹配不变 (Caddy 配 ``/uploads/* → static volume``).

Phase 5+ 计划: 接 OSS / S3 (改 ``_save_to_disk`` 为 ``_save_to_oss``), URL 改成 CDN 域。
"""

from __future__ import annotations

import asyncio
import os
import uuid
from pathlib import Path
from typing import Annotated

import filetype
from fastapi import APIRouter, Depends, File, UploadFile, status
from fastapi.responses import JSONResponse

from app.api.v1.upload.schemas import UploadResponse
from app.lib.errors import ValidationError
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context

router = APIRouter()


# 镜像 Node ``server/src/lib/file-upload.ts:7-25`` 的白名单 + 上限
_ALLOWED_TYPES: dict[str, frozenset[str]] = {
    "text": frozenset({".txt", ".md"}),
    "audio": frozenset({".mp3", ".wav", ".m4a", ".ogg", ".webm"}),
    "image": frozenset({".jpg", ".jpeg", ".png", ".gif", ".webp"}),
    "pdf": frozenset({".pdf"}),
    "presentation": frozenset({".ppt", ".pptx"}),
    "video": frozenset({".mp4", ".mov", ".avi", ".mkv"}),
    "document": frozenset({".doc", ".docx", ".xls", ".xlsx"}),
}

_MAX_SIZES_MB: dict[str, int] = {
    "text": 2,
    "audio": 50,
    "image": 10,
    "pdf": 20,
    "presentation": 50,
    "video": 200,
    "document": 20,
}


def _detect_file_type(file_name: str) -> str | None:
    """根据文件扩展名 (lowercase) 推 file_type, 不在白名单返 None。"""
    ext = Path(file_name).suffix.lower()
    for ftype, exts in _ALLOWED_TYPES.items():
        if ext in exts:
            return ftype
    return None


# Phase 5 P1 (2026-05-06): magic-byte 与 ext 一致性校验白名单。
# 扩展名能签出 magic bytes 的格式列在这里; 不在表里的 (txt/md/csv 等纯文本)
# 不做 magic-byte 校验, 因为它们没有 magic header (filetype.guess 会返 None)。
#
# 用 set 是因为多个 magic-detected MIME 可能映射同一 ext (比如 .docx 实际是
# zip container, magic 返 application/zip; 我们仍接受)。
_MAGIC_EXPECTED: dict[str, frozenset[str]] = {
    # image
    ".jpg": frozenset({"image/jpeg"}),
    ".jpeg": frozenset({"image/jpeg"}),
    ".png": frozenset({"image/png"}),
    ".gif": frozenset({"image/gif"}),
    ".webp": frozenset({"image/webp"}),
    # audio
    ".mp3": frozenset({"audio/mpeg"}),
    ".wav": frozenset({"audio/x-wav", "audio/wav"}),
    ".m4a": frozenset({"audio/mp4", "audio/x-m4a"}),
    ".ogg": frozenset({"audio/ogg", "video/ogg"}),  # ogg 容器可装音视频
    ".webm": frozenset({"video/webm", "audio/webm"}),
    # video
    ".mp4": frozenset({"video/mp4"}),
    ".mov": frozenset({"video/quicktime"}),
    ".avi": frozenset({"video/x-msvideo"}),
    ".mkv": frozenset({"video/x-matroska"}),
    # pdf
    ".pdf": frozenset({"application/pdf"}),
    # office (docx/xlsx/pptx 都是 zip container)
    ".docx": frozenset({"application/zip"}),
    ".xlsx": frozenset({"application/zip"}),
    ".pptx": frozenset({"application/zip"}),
    # 旧 office (.doc/.xls/.ppt) 是 OLE compound — filetype 识别为 application/x-cfb
    ".doc": frozenset({"application/x-cfb"}),
    ".xls": frozenset({"application/x-cfb"}),
    ".ppt": frozenset({"application/x-cfb"}),
}


def _verify_magic_matches_ext(content: bytes, file_name: str) -> None:
    """**安全** — magic-byte 内容嗅探, 校验声明的扩展名与真实 file 类型一致。

    Phase 5 P1 (2026-05-06) 安全审计补丁:
      ext-only 校验能被"伪装" — 把 PHP webshell 命名为 ``evil.pdf`` 上传, 服务器
      存盘后若静态 server (Nginx/Caddy) 配错把 .pdf 当 PHP 跑, 直接 RCE。
      magic-byte 嗅探读文件头 8KB 找 file signature, 跟扩展名比对, 不一致拒收。

    白名单外的扩展名 (.txt/.md — 没有 magic header) 跳过此校验, 走 ``_ALLOWED_TYPES``
    与 size 上限即可。

    Args:
      content: 文件全字节 (已读到内存)
      file_name: 原始文件名 (含扩展)

    Raises:
      ValidationError: magic 检测出非声明类型 (扩展骗人)
    """
    ext = Path(file_name).suffix.lower()
    expected_mimes = _MAGIC_EXPECTED.get(ext)
    if expected_mimes is None:
        # 不在签出表 (txt/md/csv 等没有 magic header), 跳过此层校验
        return

    detected = filetype.guess(content)
    if detected is None:
        # 文件确实有声明的扩展, 但读不出 magic — 有可能是空文件 / 损坏 / 真伪装
        raise ValidationError(
            f"File content does not match declared extension {ext} (no magic signature detected)"
        )
    if detected.mime not in expected_mimes:
        raise ValidationError(
            f"File content type ({detected.mime}) does not match declared extension {ext}"
        )


def _upload_root() -> Path:
    """
    UPLOAD_DIR 解析 — env var 优先, 否则默认 D 盘缓存 (Windows dev) 或 /tmp (其他)。

    生产 / Docker: ``UPLOAD_DIR=/var/lib/psynote/uploads`` 接挂载卷;
    本地 dev: 不设 env, 自动落到 D 盘 (CLAUDE.md 磁盘约束)。
    """
    env_dir = os.getenv("UPLOAD_DIR")
    if env_dir:
        return Path(env_dir)
    # Windows 上默认 D 盘 (用户 CLAUDE.md 写明 C 盘空间不足);
    # 非 Windows 走 /tmp 作 fallback。
    if os.name == "nt":
        return Path("D:/dev-cache/psynote-uploads")
    return Path("/tmp/psynote-uploads")


# ─── POST /  ─────────────────────────────────────────────────


@router.post(
    "/",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload(
    file: Annotated[UploadFile, File(description="multipart 文件字段, key 必须叫 'file'")],
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
) -> JSONResponse:
    """
    上传文件 (镜像 upload.routes.ts:13-29)。

    流程:
      1. ``file`` 必填 — FastAPI 缺 form field 时已自动 422 (Pydantic 校验)
      2. 推 file_type — 不在白名单 → 400 ``Unsupported file type``
      3. 读全 buffer + 校验 size 上限
      4. 落盘 ``UPLOAD_DIR/{org_id}/{uuid}{.ext}``
      5. 返 ``{url, fileName, fileType, fileSize}`` (201)
    """
    # auth_guard 依赖已由 get_current_user 强制; 这里 ``user`` 仅占位防 unused-arg
    _ = user

    if org is None:
        # 路由必须挂在 ``/api/orgs/{org_id}/upload`` 下, get_org_context 会
        # 校验 path 参 org_id; 走到 None 说明路由 prefix 错了, 这是开发期 bug。
        raise ValidationError("缺少 org 上下文")

    if not file.filename:
        raise ValidationError("No file uploaded")

    file_type = _detect_file_type(file.filename)
    if file_type is None:
        raise ValidationError(f"Unsupported file type: {file.filename}")

    # 读全文件到内存 (与 Node ``data.toBuffer()`` 等价); 大文件期望 Phase 5+ 改流式上 OSS
    contents = await file.read()
    file_size = len(contents)
    max_bytes = _MAX_SIZES_MB[file_type] * 1024 * 1024
    if file_size > max_bytes:
        raise ValidationError(f"File too large (max {_MAX_SIZES_MB[file_type]}MB for {file_type})")

    # Phase 5 P1 安全: magic-byte 必须匹配声明的扩展, 防"PHP webshell 伪装成 .pdf"
    _verify_magic_matches_ext(contents, file.filename)

    ext = Path(file.filename).suffix
    stored_name = f"{uuid.uuid4()}{ext}"

    org_dir = _upload_root() / org.org_id
    org_dir.mkdir(parents=True, exist_ok=True)
    target_path = org_dir / stored_name

    # 异步写盘 — 用 to_thread 让 uvicorn worker 不被磁盘 IO 卡住, 又不额外引入 aiofiles 依赖
    await asyncio.to_thread(target_path.write_bytes, contents)

    # url 仍走 ``/uploads/{org_id}/{file}`` 与 Node 兼容 (Caddy 静态 prefix 匹配不变)
    url = f"/uploads/{org.org_id}/{stored_name}"

    payload = UploadResponse(
        url=url,
        file_name=file.filename,
        file_type=file_type,
        file_size=file_size,
    )
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=payload.model_dump(by_alias=True),
    )
