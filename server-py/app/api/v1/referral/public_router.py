"""
Public referral router — 镜像 ``server/src/modules/referral/public-referral.routes.ts`` (42 行).

挂在 ``/api/public/referrals``: **无 auth**, 用 download token 守门.

  GET /download/{token}  W2.9 单次失效下载链

W2.9 失效流 (与 ``service.get_by_download_token`` 配合):
  - 第 1 次 GET token: 校验通过 → service 端 nullify token → 返数据包
  - 第 2 次 GET token: service 端 SELECT 找不到 row (token 已 NULL) → NotFoundError
    → 这里 catch → 404
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.referral.service import get_by_download_token
from app.core.database import get_db
from app.lib.errors import AppError

router = APIRouter()


@router.get("/download/{token}")
async def download_route(
    token: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """``GET /download/{token}`` 一次性下载链 (镜像 public-referral.routes.ts:31-41).

    任何 AppError (NotFoundError / ValidationError) → 404 with error message.
    Node 端也是统一 404, 不区分"过期"vs"已用过", 防 enumeration。
    """
    try:
        return await get_by_download_token(db, token)
    except AppError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "Not found", "message": exc.message},
        ) from exc


__all__ = ["router"]
