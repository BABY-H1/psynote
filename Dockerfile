# Psynote Alpha —— monorepo 多阶段构建
#
# npm workspaces 是 hoisted install,所以 node_modules 几乎全在根目录。
# 本镜像保留 devDeps:drizzle-kit 在 server 的 devDeps 里,migrate 需要它;
# 另外若要跑 server/src/db/migrations/*.ts 也需要 tsx。
# 取舍:镜像大一点(~600MB),但部署路径最简单。

# ─── Stage 1: 依赖 ──────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# 系统依赖 —— drizzle-kit 需要(编译 native bindings)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/client-portal/package.json packages/client-portal/
COPY server/package.json server/
COPY client/package.json client/

# 全量 install(含 devDeps,builder 和 runtime 都需要)
RUN npm ci

# ─── Stage 2: 构建 ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# shared (composite) → server (tsc -b) → client (vite build)
#
# packages/shared/package.json points `main`/`types`/`exports` at `./dist/*`, so the
# npm workspace symlink at node_modules/@psynote/shared resolves to built JS at runtime.
# For dev/test, server/client/client-portal tsconfig add a `paths` alias
# `@psynote/shared` → `../packages/shared/src/index.ts` so tsx/vitest/vite read source.
#
# rm -rf dist + tsbuildinfo before building: prior failed builds can leave a partial
# dist that BuildKit caches into the layer (we once saw dist/ with only index.d.ts.map).
# Fresh build every time is cheap (shared tsc ~3s) and removes that whole class of
# "phantom dist" mysteries.
RUN rm -rf packages/shared/dist packages/shared/tsconfig.tsbuildinfo \
 && npm run build --workspace=@psynote/shared \
 && npm run build --workspace=@psynote/server \
 && npm run build --workspace=@psynote/client

# ─── Stage 3: 运行时 ────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

RUN apk add --no-cache tini

# 搬节点包 + 构建产物
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/client-portal/package.json packages/client-portal/
COPY server/package.json server/
COPY client/package.json client/

# 构建产物
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# Migration 运行所需
COPY --from=builder /app/server/drizzle ./server/drizzle
COPY --from=builder /app/server/drizzle.config.ts ./server/
COPY --from=builder /app/server/src/db ./server/src/db

EXPOSE 4000

COPY scripts/container-start.sh /usr/local/bin/container-start.sh
RUN chmod +x /usr/local/bin/container-start.sh

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/usr/local/bin/container-start.sh"]
