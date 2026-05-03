# Psynote FastAPI server — 多阶段构建
#
# 与根 Dockerfile (Node) 并存。Phase 0 阶段 Caddy 不路由到本服务,
# 仅确保 docker compose up app-py 起得来。
#
# 镜像选择 python:3.12-slim:
#   - alpine 在 WeasyPrint (Cairo/Pango 原生依赖) 和 asyncpg/psycopg
#     编译上常踩坑, 用 slim (Debian) 更稳。
#   - 体积约 200MB (vs alpine 80MB), Phase 6 切流前可再优化。

# ─── Stage 1: deps ──────────────────────────────────────────────
FROM python:3.12-slim AS deps

WORKDIR /app

# 系统依赖:
#   build-essential: 部分 wheel (pyjwt cryptography 等) 缺 prebuilt 时回落到源码编译
#   libpq-dev: psycopg native binding (asyncpg 不需要, psycopg 在 Alembic 用)
#   libcairo2 + libpango-1.0-0 + libpangoft2-1.0-0 + libgdk-pixbuf-2.0-0 + libffi-dev:
#     WeasyPrint 渲染 PDF 必需 (没有这几个, weasyprint 启动直接报 OSError)
#   curl: healthcheck 用
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libcairo2 \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# 装 uv (官方安装脚本, 锁版本)
COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /usr/local/bin/uv

# 拷贝项目元数据先, 利用 docker layer cache。pyproject.toml + uv.lock
# 不变时, 这层 sync 不重跑, 镜像 build 飞快。
COPY pyproject.toml uv.lock ./

# --frozen: 严格按 uv.lock 装, 任何 lock 与 pyproject 不一致就 fail。
# 这样 build 出来的镜像与 dev/CI 环境字节级一致, 可重现。
RUN uv sync --frozen --no-install-project

# ─── Stage 2: runtime ──────────────────────────────────────────
FROM python:3.12-slim AS runtime

WORKDIR /app

# Runtime 系统依赖 (与 deps 阶段同样需要 weasyprint + psycopg)。
# 不装 curl — healthcheck 用 python stdlib 的 urllib.request 即可,
# 省 ~5 MB + 减少 runtime 攻击面。
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libcairo2 \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# 拷虚拟环境
COPY --from=deps /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app"

# 拷应用代码
COPY app ./app
COPY pyproject.toml ./

EXPOSE 8001

# Healthcheck → /health endpoint (Phase 0 实现)。
# 用 python stdlib 而不是 curl — 容器里少一个 apt 包 + 少一个 process spawn。
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; \
        sys.exit(0 if urllib.request.urlopen('http://localhost:8001/health',timeout=2).status==200 else 1)" \
    || exit 1

# uvicorn 直接启动, 不用 gunicorn — alpha 阶段单进程足够,
# Phase 6 切流前会评估改 gunicorn + uvicorn worker 模式
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
