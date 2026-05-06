"""Phase 5 — users 加 phone + phone_verified (国内手机号登录)。

Revision ID: 0002_add_phone_to_users
Revises: 0001_phase2_additions
Create Date: 2026-05-04

变更内容 (Phase 5 决策 2026-05-04):
  Founder 决策: 国内市场不适合邮箱登录, 全切手机号. 短信验证码 Phase 7+ 加,
  现在做 Step 1: **手机号 + 密码登录**。

  1. **users 加 phone**: nullable Text, partial unique (phone IS NOT NULL)
     - 不在列上加 ``UNIQUE`` (那会限制 NULL 唯一); 用 partial unique index
       让 NULL 可多行, 非 NULL 唯一。
  2. **users 加 phone_verified**: bool default false
     - 短信验证码功能 Phase 7+ 上线后, 用 verify endpoint 置 true。
     - 现在所有新建 user 默认 false (= 未验证)。

部署:
  - dev/staging: ``alembic upgrade head`` 即可 (现有用户 phone 留 NULL, 走老路径)。
  - 生产: 同上, 不需要 backfill (alpha 期可视为 fresh DB)。
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_add_phone_to_users"
down_revision: str | None = "0001_phase2_additions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. phone 列 — nullable, 非 NULL 时受 partial unique 约束
    op.add_column(
        "users",
        sa.Column("phone", sa.Text(), nullable=True),
    )
    # 2. phone_verified 列 — Phase 7+ 短信验证后置 true
    op.add_column(
        "users",
        sa.Column(
            "phone_verified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    # 3. 部分唯一索引 — phone IS NOT NULL 范围内 unique
    #    (列上不能直接 UNIQUE, 因为 PG 会让 NULL 也参与唯一比较, 多个 NULL
    #     虽不冲突但语义上"列承诺 unique"会引起 ORM 反射困惑; partial 更明确)
    op.create_index(
        "uq_users_phone",
        "users",
        ["phone"],
        unique=True,
        postgresql_where=sa.text("phone IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_users_phone", table_name="users")
    op.drop_column("users", "phone_verified")
    op.drop_column("users", "phone")
