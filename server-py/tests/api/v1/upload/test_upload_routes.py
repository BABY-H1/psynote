"""
Upload routes — 镜像 ``server/src/modules/upload/upload.routes.ts`` 行为
(Node 端没有同名 .test.ts, 这里写 smoke 级别覆盖)。

覆盖:
  - 未认证 → 401
  - 缺 file 字段 → 422 (FastAPI Pydantic 校验, 不到 router 体)
  - 不支持的扩展名 → 400 ``Unsupported file type``
  - 文件超 size 上限 → 400 ``File too large``
  - 合法 png 上传 → 201 + ``{url, fileName, fileType, fileSize}`` (camelCase)
  - 落盘到 ``UPLOAD_DIR/{org_id}/{uuid}.png``, 文件实际写入

测试用 ``UPLOAD_DIR`` env 指到 ``tmp_path`` (autouse fixture), 跑完自动清。
"""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

# 路由 prefix (镜像 Node ``app.ts:214``)
_ORG_ID = "00000000-0000-0000-0000-000000000099"
_PREFIX = f"/api/orgs/{_ORG_ID}/upload"


# ─── 401: 未认证 ─────────────────────────────────────────────────


def test_upload_unauthenticated_returns_401(unauthed_client: TestClient) -> None:
    """无 Bearer token → 401 (走 ``get_current_user``)。"""
    files = {"file": ("test.png", b"fake bytes", "image/png")}
    response = unauthed_client.post(f"{_PREFIX}/", files=files)
    assert response.status_code == 401


# ─── 422: schema 校验 ───────────────────────────────────────────


def test_upload_without_file_field_returns_422(authed_org_client: TestClient) -> None:
    """multipart 无 ``file`` 字段 → 422 (FastAPI 自带 Pydantic 校验)。"""
    response = authed_org_client.post(f"{_PREFIX}/", files={})
    # FastAPI 会被 _handle_validation 翻成 400 (RequestValidationError → 400);
    # 检查 status_code 在 4xx 区域且 message 提"file" 字段。
    assert response.status_code in (400, 422)
    body = response.json()
    # 不同 FastAPI 版本可能 detail / message, 都接受
    assert "file" in (body.get("message", "") + str(body.get("detail", ""))).lower()


# ─── 400: 不支持的类型 ──────────────────────────────────────────


def test_upload_unsupported_extension_returns_400(authed_org_client: TestClient) -> None:
    """``.exe`` 不在白名单 → 400 ``Unsupported file type: ...``。"""
    files = {"file": ("evil.exe", b"\x00\x01\x02", "application/octet-stream")}
    response = authed_org_client.post(f"{_PREFIX}/", files=files)
    assert response.status_code == 400
    assert "Unsupported file type" in response.json()["message"]


# ─── 400: 大小超限 ──────────────────────────────────────────────


def test_upload_oversized_file_returns_400(authed_org_client: TestClient) -> None:
    """text 类上限 2MB; 上传 3MB ``.txt`` 必须 400 ``File too large``。"""
    payload = b"x" * (3 * 1024 * 1024)  # 3MB > 2MB text 上限
    files = {"file": ("big.txt", payload, "text/plain")}
    response = authed_org_client.post(f"{_PREFIX}/", files=files)
    assert response.status_code == 400
    body = response.json()
    assert "File too large" in body["message"]
    assert "text" in body["message"]


# ─── 201: 正常上传 ──────────────────────────────────────────────


def test_upload_png_returns_201_and_writes_file(
    authed_org_client: TestClient,
    upload_dir: Path,
    fake_org_id: str,
) -> None:
    """合法 png → 201 + 落盘到 ``upload_dir/{org_id}/{uuid}.png``。"""
    payload = b"\x89PNG\r\n\x1a\n" + b"x" * 1024  # 假装 png magic + 内容
    files = {"file": ("photo.png", payload, "image/png")}

    response = authed_org_client.post(f"{_PREFIX}/", files=files)
    assert response.status_code == 201

    body = response.json()
    # camelCase wire format
    assert "url" in body
    assert body["fileName"] == "photo.png"
    assert body["fileType"] == "image"
    assert body["fileSize"] == len(payload)
    # snake_case 必须不在 wire (防 alias 双写)
    assert "file_name" not in body
    assert "file_type" not in body

    # url 形如 /uploads/{org_id}/{uuid}.png — Node 兼容
    assert body["url"].startswith(f"/uploads/{fake_org_id}/")
    assert body["url"].endswith(".png")

    # 落盘验证: upload_dir/{org_id}/<stored>.png 必须存在 + 字节相等
    org_dir = upload_dir / fake_org_id
    assert org_dir.is_dir()
    stored_files = list(org_dir.iterdir())
    assert len(stored_files) == 1
    written = stored_files[0]
    assert written.suffix == ".png"
    assert written.read_bytes() == payload
