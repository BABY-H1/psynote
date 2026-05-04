"""DB layer — SQLAlchemy 2.0 declarative models + 共享 mixin。

子模块:
  - app.db.base        TimestampMixin / CreatedAtOnlyMixin (大多数表用)
  - app.db.models.*    一表一文件, 75 张表对应 Drizzle server/src/db/schema.ts

引擎 / session 在 app.core.database, 不在此处。
"""
