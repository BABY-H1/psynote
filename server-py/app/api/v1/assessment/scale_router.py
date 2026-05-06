"""
Scale router — 镜像 ``server/src/modules/assessment/scale.routes.ts`` (127 行).

挂在 ``/api/orgs/{org_id}/scales`` prefix. 4 个 endpoint:

  GET    /              — 列表 (任意 staff, 含 dimensionCount/itemCount)
  GET    /{scale_id}    — 详情 (含嵌套 dimensions/rules/items)
  POST   /              — 创建 (admin/counselor)
  PATCH  /{scale_id}    — 更新 (admin/counselor; dimensions/items 必须同送同省)
  DELETE /{scale_id}    — 硬删 (admin/counselor)

知识库可见性:
  - 自机构 scale (org_id = me)
  - 平台公开 scale (org_id IS NULL AND is_public=true)
  - allowed_org_ids array 显式授权 (Phase 7+ 接入)

复杂操作:
  - createScale: 单 transaction 写 scale + dimensions + rules + items, items 的
    dimension_id 通过 dimension_index 解析新 inserted dimensions 的 id.
  - updateScale: dimensions/items 必须一起送 (item.dimensionIndex 需稳定 dimension 顺序).
    替换策略: 先删 items (FK 约束), 再删 dimensions (cascade rules), 重建 + 重连 items.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy import and_, asc, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.assessment.schemas import (
    DimensionInput,
    DimensionOut,
    DimensionRuleOut,
    ItemInput,
    ScaleCreateRequest,
    ScaleDetail,
    ScaleItemOut,
    ScaleListRow,
    ScaleUpdateRequest,
)
from app.core.database import get_db
from app.db.models.dimension_rules import DimensionRule
from app.db.models.scale_dimensions import ScaleDimension
from app.db.models.scale_items import ScaleItem
from app.db.models.scales import Scale
from app.lib.errors import ForbiddenError, NotFoundError, ValidationError
from app.lib.uuid_utils import parse_uuid_or_raise
from app.middleware.audit import record_audit
from app.middleware.auth import AuthUser, get_current_user
from app.middleware.org_context import OrgContext, get_org_context
from app.middleware.role_guards import (
    reject_client as _reject_client,
)
from app.middleware.role_guards import (
    require_admin_or_counselor as _require_admin_or_counselor,
)

router = APIRouter()


async def _assert_scale_owned_by_org(
    db: AsyncSession, scale_id: uuid.UUID, org_uuid: uuid.UUID
) -> Scale:
    """``assertLibraryItemOwnedByOrg`` 等价: 仅自机构 scale 可改 (平台公开 scale 不可改)."""
    q = select(Scale).where(Scale.id == scale_id).limit(1)
    s = (await db.execute(q)).scalar_one_or_none()
    if s is None:
        raise NotFoundError("Scale", str(scale_id))
    if s.org_id != org_uuid:
        raise ForbiddenError("此量表不属于本机构")
    return s


# ─── routes ─────────────────────────────────────────────────────


@router.get("/", response_model=list[ScaleListRow])
async def list_scales(
    org_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ScaleListRow]:
    """列表: 自机构 + 平台公开 (org_id IS NULL AND is_public=true). 镜像 service:51-83."""
    _reject_client(org)

    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    q = (
        select(Scale)
        .where(
            or_(
                Scale.org_id == org_uuid,
                and_(Scale.org_id.is_(None), Scale.is_public.is_(True)),
            )
        )
        .order_by(asc(Scale.title))
    )
    rows = list((await db.execute(q)).scalars().all())

    # Phase 5 N+1 修: 之前每个 scale 各 2 查询 (count dimensions + count items) → 2N+1。
    # 改成 2 个 GROUP BY 单查询, 一次拿全部 counts. 总查询数 = 3 (scales + dim_counts + item_counts).
    if rows:
        scale_ids = [s.id for s in rows]
        dim_count_q = (
            select(ScaleDimension.scale_id, func.count().label("c"))
            .where(ScaleDimension.scale_id.in_(scale_ids))
            .group_by(ScaleDimension.scale_id)
        )
        item_count_q = (
            select(ScaleItem.scale_id, func.count().label("c"))
            .where(ScaleItem.scale_id.in_(scale_ids))
            .group_by(ScaleItem.scale_id)
        )
        dim_counts: dict[uuid.UUID, int] = {
            sid: int(c) for sid, c in (await db.execute(dim_count_q)).all()
        }
        item_counts: dict[uuid.UUID, int] = {
            sid: int(c) for sid, c in (await db.execute(item_count_q)).all()
        }
    else:
        dim_counts = {}
        item_counts = {}

    return [
        ScaleListRow(
            id=str(s.id),
            org_id=str(s.org_id) if s.org_id else None,
            title=s.title,
            description=s.description,
            instructions=s.instructions,
            scoring_mode=s.scoring_mode or "sum",
            is_public=bool(s.is_public),
            created_by=str(s.created_by) if s.created_by else None,
            created_at=getattr(s, "created_at", None),
            updated_at=getattr(s, "updated_at", None),
            dimension_count=dim_counts.get(s.id, 0),
            item_count=item_counts.get(s.id, 0),
        )
        for s in rows
    ]


@router.get("/{scale_id}", response_model=ScaleDetail)
async def get_scale(
    org_id: str,
    scale_id: str,
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScaleDetail:
    """单个 scale + 嵌套 dimensions/rules/items. 镜像 service:86-150."""
    _reject_client(org)

    sid = parse_uuid_or_raise(scale_id, field="scaleId")
    s_q = select(Scale).where(Scale.id == sid).limit(1)
    s = (await db.execute(s_q)).scalar_one_or_none()
    if s is None:
        raise NotFoundError("Scale", scale_id)

    d_q = (
        select(ScaleDimension)
        .where(ScaleDimension.scale_id == sid)
        .order_by(asc(ScaleDimension.sort_order))
    )
    dims = list((await db.execute(d_q)).scalars().all())
    dim_ids = [d.id for d in dims]

    rules: list[DimensionRule] = []
    if dim_ids:
        r_q = select(DimensionRule).where(DimensionRule.dimension_id.in_(dim_ids))
        rules = list((await db.execute(r_q)).scalars().all())

    i_q = select(ScaleItem).where(ScaleItem.scale_id == sid).order_by(asc(ScaleItem.sort_order))
    items = list((await db.execute(i_q)).scalars().all())

    full_dims: list[DimensionOut] = []
    for d in dims:
        d_rules = [
            DimensionRuleOut(
                id=str(r.id),
                min_score=str(r.min_score),
                max_score=str(r.max_score),
                label=r.label,
                description=r.description,
                advice=r.advice,
                risk_level=r.risk_level,
            )
            for r in rules
            if r.dimension_id == d.id
        ]
        full_dims.append(
            DimensionOut(
                id=str(d.id),
                name=d.name,
                description=d.description,
                calculation_method=d.calculation_method or "sum",
                sort_order=d.sort_order,
                rules=d_rules,
            )
        )

    item_outs = [
        ScaleItemOut(
            id=str(it.id),
            dimension_id=str(it.dimension_id) if it.dimension_id else None,
            text=it.text,
            is_reverse_scored=bool(it.is_reverse_scored),
            options=list(it.options or []),
            sort_order=it.sort_order,
        )
        for it in items
    ]

    return ScaleDetail(
        id=str(s.id),
        org_id=str(s.org_id) if s.org_id else None,
        title=s.title,
        description=s.description,
        instructions=s.instructions,
        scoring_mode=s.scoring_mode or "sum",
        is_public=bool(s.is_public),
        created_by=str(s.created_by) if s.created_by else None,
        created_at=getattr(s, "created_at", None),
        updated_at=getattr(s, "updated_at", None),
        dimensions=full_dims,
        items=item_outs,
    )


async def _insert_dimensions_and_rules(
    db: AsyncSession,
    scale_id: uuid.UUID,
    dimensions: list[DimensionInput],
) -> list[uuid.UUID]:
    """插 dimensions + rules, 返回新 dimension id 列表 (顺序与 input 一致)."""
    new_dim_ids: list[uuid.UUID] = []
    for idx, d in enumerate(dimensions):
        new_dim = ScaleDimension(
            scale_id=scale_id,
            name=d.name,
            description=d.description,
            calculation_method=d.calculation_method or "sum",
            sort_order=d.sort_order if d.sort_order is not None else idx,
        )
        db.add(new_dim)
        await db.flush()  # 取 new_dim.id
        new_dim_ids.append(new_dim.id)

        for r in d.rules or []:
            db.add(
                DimensionRule(
                    dimension_id=new_dim.id,
                    min_score=r.min_score,
                    max_score=r.max_score,
                    label=r.label,
                    description=r.description,
                    advice=r.advice,
                    risk_level=r.risk_level,
                )
            )
    return new_dim_ids


async def _insert_items(
    db: AsyncSession,
    scale_id: uuid.UUID,
    dim_ids: list[uuid.UUID],
    items: list[ItemInput],
) -> None:
    """插 items, dim_id 通过 dimension_index 映射到 dim_ids."""
    for idx, it in enumerate(items):
        target_dim = dim_ids[it.dimension_index] if 0 <= it.dimension_index < len(dim_ids) else None
        # mapped column 'text' 与 sqlalchemy.text 函数名冲突, 但 ORM 构造器允许直接用 kw
        new_item = ScaleItem(
            scale_id=scale_id,
            dimension_id=target_dim,
            text=it.text,
            is_reverse_scored=bool(it.is_reverse_scored),
            options=[opt.model_dump() for opt in it.options],
            sort_order=it.sort_order if it.sort_order is not None else idx,
        )
        db.add(new_item)


@router.post("/", response_model=ScaleDetail, status_code=status.HTTP_201_CREATED)
async def create_scale(
    org_id: str,
    body: ScaleCreateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScaleDetail:
    """创建 scale + dimensions + rules + items (单 transaction). 镜像 service:153-241."""
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    user_uuid = parse_uuid_or_raise(user.id, field="userId")

    try:
        s = Scale(
            org_id=org_uuid,
            title=body.title,
            description=body.description,
            instructions=body.instructions,
            scoring_mode=body.scoring_mode or "sum",
            is_public=bool(body.is_public),
            created_by=user_uuid,
        )
        db.add(s)
        await db.flush()  # 取 s.id

        dim_ids = await _insert_dimensions_and_rules(db, s.id, body.dimensions)
        await _insert_items(db, s.id, dim_ids, body.items)

        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="create",
        resource="scales",
        resource_id=str(s.id),
        ip_address=request.client.host if request.client else None,
    )
    return await get_scale(org_id, str(s.id), org, db)


@router.patch("/{scale_id}", response_model=ScaleDetail)
async def update_scale(
    org_id: str,
    scale_id: str,
    body: ScaleUpdateRequest,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScaleDetail:
    """更新 scale (含嵌套替换). 镜像 service:282-384.

    dimensions/items 一起送或都不送 — item.dimensionIndex 需要稳定 dimension 顺序.
    """
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    sid = parse_uuid_or_raise(scale_id, field="scaleId")

    # 仅自机构 scale 可改
    s = await _assert_scale_owned_by_org(db, sid, org_uuid)

    if (body.dimensions is None) != (body.items is None):
        raise ValidationError("updateScale: dimensions and items must be sent together")

    try:
        # 1. scalar updates
        has_scalar = False
        if body.title is not None:
            s.title = body.title
            has_scalar = True
        if body.description is not None:
            s.description = body.description
            has_scalar = True
        if body.instructions is not None:
            s.instructions = body.instructions
            has_scalar = True
        if body.scoring_mode is not None:
            s.scoring_mode = body.scoring_mode
            has_scalar = True
        if body.is_public is not None:
            s.is_public = body.is_public
            has_scalar = True

        if has_scalar or body.dimensions is not None:
            s.updated_at = datetime.now(UTC)

        # 2. nested replace (一起送或都不送)
        if body.dimensions is not None and body.items is not None:
            # 先删 items (FK 约束: items.dimension_id NO ACTION)
            await db.execute(delete(ScaleItem).where(ScaleItem.scale_id == sid))
            # 再删 dimensions (cascade rules)
            await db.execute(delete(ScaleDimension).where(ScaleDimension.scale_id == sid))
            # 重建
            dim_ids = await _insert_dimensions_and_rules(db, sid, body.dimensions)
            await _insert_items(db, sid, dim_ids, body.items)

        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="update",
        resource="scales",
        resource_id=scale_id,
        ip_address=request.client.host if request.client else None,
    )
    return await get_scale(org_id, scale_id, org, db)


@router.delete("/{scale_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scale(
    org_id: str,
    scale_id: str,
    request: Request,
    user: Annotated[AuthUser, Depends(get_current_user)],
    org: Annotated[OrgContext | None, Depends(get_org_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """硬删 (cascade dim/items/rules). 镜像 service:387-395."""
    _require_admin_or_counselor(org)
    org_uuid = parse_uuid_or_raise(org_id, field="orgId")
    sid = parse_uuid_or_raise(scale_id, field="scaleId")

    await _assert_scale_owned_by_org(db, sid, org_uuid)

    try:
        await db.execute(delete(Scale).where(Scale.id == sid))
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await record_audit(
        db=db,
        org_id=org_id,
        user_id=user.id,
        action="delete",
        resource="scales",
        resource_id=scale_id,
        ip_address=request.client.host if request.client else None,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


__all__ = ["router"]
