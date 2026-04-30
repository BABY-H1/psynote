#!/bin/sh
# Container entrypoint — sync client static to shared volume, run migrations, start server.
set -e

# 1. 把 client/dist 同步到共享 volume(让 Caddy 容器读)
if [ -d "/mnt/client-static" ]; then
  echo "[entrypoint] Syncing client/dist → /mnt/client-static"
  rm -rf /mnt/client-static/*
  cp -r /app/client/dist/* /mnt/client-static/
fi

# 2. 跑 drizzle migrations(幂等,每次启动都跑)
#
# 历史: 早期 dev 走 drizzle push 绕过 migration 链路,导致 0002/0006/0007 等
# 引用了 schema.ts 里有但从未 CREATE 的表。2026-04-25 把所有历史 migrations 全
# 删掉、用 schema.ts 重新生成单条 0000 基线 (`drizzle-kit generate`)。从此
# migrate 链路是干净的——后续 schema 变更走 generate 加新一条 SQL,不再 push。
echo "[entrypoint] Running drizzle migrate"
cd /app/server && npx drizzle-kit migrate

# 3. 起 Fastify server
echo "[entrypoint] Starting server"
cd /app && exec node server/dist/server.js
