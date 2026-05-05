# Psynote FastAPI Server

> Phase 0 脚手架阶段。完整迁移计划见 `~/.claude/plans/optimized-swimming-sunset.md`。
> 这里是 Fastify → FastAPI 全量迁移 (Option C) 的目标项目, Caddy 暂未路由到本服务。

## 当前状态

- ✅ Phase 0 — 脚手架 + `/health` endpoint + Pydantic config
- ⬜ Phase 1 — Auth + middleware 地基 (JWT/bcrypt 与 Node 互通)
- ⬜ Phase 2 — DB schema (75 表 SQLAlchemy)
- ⬜ Phase 3 — 26 模块批量翻译
- ✅ Phase 4 — Jobs + 集成 (Celery 3 队列 / WeasyPrint / aiosmtplib)
- ⬜ Phase 5 — 安全审计重做
- ⬜ Phase 6 — 生产对等 + 切流

## 本地启动

需要 [uv](https://docs.astral.sh/uv/) 已安装。

```bash
cd server-py
uv sync                                       # 装依赖到 .venv
uv run uvicorn app.main:app --reload --port 8001
curl http://localhost:8001/health             # → {"status":"ok",...}
```

## 测试

严格遵守 `~/.claude/CLAUDE.md` TDD 规范: **Red → Green** (写 failing test, 看到 fail, 写代码, 看到 pass)。

```bash
uv run pytest                                 # 全量
uv run pytest tests/core/test_config.py -v    # 单文件
uv run pytest --cov=app --cov-report=term     # 覆盖率
```

## 代码质量

```bash
uv run ruff check .          # lint
uv run ruff format .         # format
uv run mypy app              # 类型检查 (strict)
```

## Docker

```bash
# 在仓库根:
docker compose up app-py     # 起 Python 服务 (port 8001)
docker compose logs -f app-py
```

## Celery (Phase 4 — 任务队列)

3 个 queue: `compliance` (合规巡检) / `reminders` (预约提醒) / `follow-up` (随访推送)。

```bash
# Worker — 一进程消费 3 个 queue (production 可拆 3 个进程独立 scale)
uv run celery -A app.jobs.celery_app worker \
    --loglevel=info \
    --queues=compliance,reminders,follow-up

# Beat — 定时调度 (每天 03:00 / 整点 / 每天 09:00)
uv run celery -A app.jobs.celery_app beat --loglevel=info

# 单元测试 — 用 CELERY_TASK_ALWAYS_EAGER=True 同步执行 (无 Redis 依赖)
uv run pytest tests/jobs/
```

## 邮件 (aiosmtplib)

`SMTP_DEV_MODE=true` (默认) 时仅 logger 输出, 不真发邮件 — 适合 dev/CI/单测。
production 部署设 `SMTP_DEV_MODE=false` + 配 `SMTP_HOST/USER/PASS/FROM`。

## PDF (WeasyPrint)

Linux Docker 容器内含完整 GTK + cairo + fontconfig, 真实生成中文 PDF 无问题。
Windows 本地开发若缺 GTK runtime, 单元测试用 mock 不依赖系统库。

## 技术栈映射 (vs Fastify Node 版)

| Fastify (Node) | FastAPI (Python) |
|---|---|
| Fastify 5 | FastAPI 0.115+ |
| TypeScript 5 | Python 3.12+ |
| Drizzle ORM | SQLAlchemy 2.0 (async) |
| drizzle-kit | Alembic |
| Zod | Pydantic v2 |
| bcryptjs | passlib[bcrypt] |
| jsonwebtoken | PyJWT (algorithms=['HS256'] 必须 pin) |
| BullMQ | Celery + Redis |
| pdfkit | WeasyPrint |
| nodemailer | aiosmtplib |
| @fastify/multipart | FastAPI UploadFile |
| @fastify/cors | FastAPI CORSMiddleware |
| @fastify/rate-limit | slowapi |
| Vitest | pytest + pytest-asyncio |
| @psynote/shared (TS) | psynote_shared (Python, 双维护) |

## 关键文件

```
server-py/
├── pyproject.toml          # uv 项目配置 + ruff/mypy/pytest 配置
├── Dockerfile              # python:3.12-slim 多阶段
├── .python-version         # 3.12
├── app/
│   ├── main.py             # FastAPI app entry + /health
│   ├── core/
│   │   ├── config.py       # Pydantic Settings (镜像 server/src/config/env.ts)
│   │   ├── security.py     # JWT + bcrypt (Phase 1)
│   │   └── database.py     # async SQLAlchemy session (Phase 0)
│   ├── middleware/         # auth/data_scope/phi_access (Phase 1)
│   ├── db/models/          # 75 张表 (Phase 2)
│   ├── api/v1/<module>/    # 26 路由模块 (Phase 3)
│   ├── services/           # 业务逻辑
│   ├── schemas/            # Pydantic 请求/响应模型
│   └── jobs/               # Celery tasks (Phase 4)
└── tests/                  # pytest, mirror server/src/*.test.ts
```
