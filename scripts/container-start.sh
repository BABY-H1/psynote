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
echo "[entrypoint] Running drizzle migrate"
cd /app/server && npx drizzle-kit migrate

# 3. 起 Fastify server
echo "[entrypoint] Starting server"
cd /app && exec node server/dist/server.js
