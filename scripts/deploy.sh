#!/usr/bin/env bash
# Psynote Alpha — 单命令部署 / 更新脚本
#
# 用法(在 VPS 上执行):
#   cd /opt/psynote && ./scripts/deploy.sh
#
# 假设:
#   - 当前目录是 psynote git 仓库的 clone
#   - .env 已经填好(参照 .env.example)
#   - Docker + docker-compose 已装好
#
# 流程:
#   1. 拉最新代码
#   2. 重新构建 app image
#   3. 重启服务(零停机:Caddy 保持运行,app 滚动重启)
#   4. 输出日志前 50 行以便观察

set -euo pipefail

echo "[deploy] ─── psynote alpha deploy ───"
cd "$(dirname "$0")/.."

# 0. 检查 .env 存在
if [ ! -f .env ]; then
  echo "[deploy] ERROR: .env 不存在。先从 .env.example 复制并填值。"
  exit 1
fi

# 1. 拉最新代码
echo "[deploy] (1/4) git pull"
git pull --ff-only

# 2. 构建 app image(不拉 postgres/redis/caddy 镜像,它们不变)
echo "[deploy] (2/4) docker compose build app"
docker compose build app

# 3. 起 / 重启
echo "[deploy] (3/4) docker compose up -d"
docker compose up -d

# 4. 等待 app 健康
echo "[deploy] (4/4) 等 app 起来..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  if docker compose exec -T app wget -q -O- http://localhost:4000/api/health >/dev/null 2>&1; then
    echo "[deploy] ✓ app 健康"
    break
  fi
  sleep 3
done

echo ""
echo "[deploy] ─── 日志(最近 50 行)───"
docker compose logs --tail 50 app

echo ""
echo "[deploy] 完成。站点: https://$(grep ^CADDY_DOMAIN .env | cut -d= -f2)"
