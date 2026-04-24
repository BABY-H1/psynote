# Alpha 本地隧道模式 Runbook（零服务器内测）

> **适用场景：** 你本地有 Docker，只有 1-2 个内测用户，短期（几天到一两周）验证核心路径。
> **优点：** 零服务器成本；起停在你掌控。
> **局限：** 本机必须开机；家庭 IP 发邮件不稳；带宽上行有限。
>
> **不适用场景：** 5+ 测试者持续一周、离线跑后台任务、需要稳定 SLA —— 走 VPS 版 [alpha.md](./alpha.md)。

---

## 0. 前置准备

| 项 | 说明 |
|---|---|
| Windows / Mac / Linux | 任一都行 |
| **Docker Desktop**（Win/Mac）或 Docker Engine（Linux） | [download](https://www.docker.com/products/docker-desktop/) |
| 一个 SMTP 账号（**可选**） | 1-2 人内测阶段可缺省,密码重置走"你手动在后台帮他重置"；要发邮件时推荐阿里云邮件推送 |
| 一张真实的邮箱用来做 admin 账号 | 用于登录 |

**不需要：** VPS、域名、SSL 证书、邮件发信域名的 SPF/DKIM。

---

## 1. 克隆 + 配置 `.env`

```bash
git clone <你的 git 仓库 URL> psynote && cd psynote
cp .env.example .env
```

编辑 `.env`,**本地隧道模式只需填 4 个必填**：

```bash
# 1-2 人内测用 development —— mailer 缺 SMTP 只会警告不会拒启
NODE_ENV=development

# Caddy 在 80 跑纯 HTTP,TLS 交给 Cloudflare Tunnel 的 edge 终结
CADDY_DOMAIN=:80

# 起 cloudflared 之前先随便写,拿到真实 URL 后回填
CLIENT_URL=http://localhost
PUBLIC_BASE_URL=http://localhost

# 必填:数据库密码(本地也要强一点)
POSTGRES_PASSWORD=<openssl rand -hex 16>

# 必填:JWT 签名密钥(哪怕本地也别用默认值)
JWT_SECRET=<openssl rand -hex 48>

# 其他留空即可:SMTP_*, AI_*
```

Windows 用户生成强随机值：
```powershell
# PowerShell
-join ((48..57)+(97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

或者直接去 https://www.random.org/strings/ 拿一条够长的。

---

## 2. 启动栈 + 隧道

```bash
# 带 tunnel profile 启动 —— 多起一个 cloudflared 容器
docker compose --profile tunnel up -d

# 看每个容器是否健康
docker compose ps
# 应看到 postgres / redis / app / caddy / cloudflared 五个 running
```

**等所有容器起稳大概 60-90 秒**（postgres 健康检查 + drizzle migrate）。

---

## 3. 拿到 Cloudflare Tunnel 公网 URL

```bash
docker compose logs cloudflared | grep trycloudflare
```

会看到一行像：

```
2026-04-24T10:23:11Z INF | https://frozen-panda-something.trycloudflare.com |
```

**这就是你的公网 URL**（每次重启 cloudflared 会变 —— 参见 §7 固定方法）。

---

## 4. 回填 `.env` + 重启 app

```bash
# 把上一步拿到的 URL 填进 .env
nano .env
```

```bash
CLIENT_URL=https://frozen-panda-something.trycloudflare.com
PUBLIC_BASE_URL=https://frozen-panda-something.trycloudflare.com
```

```bash
# 只重启 app(不动 cloudflared 避免 URL 再变)
docker compose up -d app
```

---

## 5. 跑自定义 migration + seed

```bash
docker compose exec app sh

# 容器内 —— 跑 026 / 027 等非 drizzle-kit 的 ts migration
for m in server/src/db/migrations/0{26,27}-*.ts; do
  echo "▶ $m"
  npx tsx "$m"
done

# seed demo 机构(1 个咨询中心 + 1 个学校)
npx tsx server/src/seed.ts
exit
```

---

## 6. 用浏览器开 URL 验证 5 个核心场景

**全程用上一步的 `trycloudflare.com` URL**（HTTPS,Cloudflare 自动给）

| # | 场景 | 怎么测 |
|---|---|---|
| 1 | 登录后进 admin 后台 | URL `/login` → 用 seed.ts 里的 `admin@...` 登录 → 跳 `/admin/dashboard` |
| 2 | 创建新机构 + 咨询师 | `/admin/tenants/new` 6 步向导建一个 counseling 机构,加 2 个咨询师 |
| 3 | 咨询师登录 | 新开浏览器(或无痕)用新建的咨询师账号登 → 进主 app |
| 4 | C 端来访者自助注册 | 新开无痕 → `/register/counseling/<orgSlug>` 填表注册 → 应直接进 `/portal` |
| 5 | 忘记密码流程 | `/login` 点"忘记密码" → 填邮箱 → 提交成功 |

**第 5 条关于邮件发送：** 你本地 `NODE_ENV=development` 且 SMTP 未填,密码重置 token 会记在 `app` 容器日志里:
```bash
docker compose logs app | grep "password.*reset"
# 或看 log 里 "(no transporter ...)" 行
```
你可以从日志里手动取 token 拼成 URL 发给测试者。或者,后台 `docker compose exec postgres psql -U psynote` 直接改 `users.password_hash`。

---

## 7. 固定 trycloudflare URL（可选,免费账号）

默认 quick tunnel URL 会在你重启 cloudflared 时变。如果测试者受不了 URL 反复变,去 Cloudflare 免费注册 → 创建 Named Tunnel:

1. 免费注册 https://dash.cloudflare.com/sign-up
2. 面板里 `Access → Tunnels → Create a tunnel`
3. 起名 `psynote-alpha` → 下载 tunnel credential (`.json` 文件)
4. 映射 Public Hostname → 一个 Cloudflare 给的子域名(如 `psynote.<你注册的域>.com`)到 `http://caddy:80`
5. 本地把 credential 文件放进 `./cloudflared-config/` → 改 docker-compose 里 cloudflared 的 command 用 credential 跑

（这一步等内测扩大到 3+ 人再做也不晚）

---

## 8. 日常

```bash
# 全部起
docker compose --profile tunnel up -d

# 看日志
docker compose logs -f app       # 后端
docker compose logs -f cloudflared  # 隧道(重启后 URL 会变)

# 重启 app(配置改了)
docker compose up -d app

# 全部停
docker compose --profile tunnel down

# 清一切数据(⚠️ 删 volume)
docker compose --profile tunnel down -v
```

**特别提醒：** 你关机/休眠 → 所有容器停 → 测试者上不来。不要合上笔记本。

---

## 9. 从本地迁到 VPS 的时机

当你遇到其中任一情况,说明该买 VPS 了:
- 测试者超过 3 人,且他们会在不同时段访问
- 你需要离开机器/关机(出差、睡觉)
- 密码重置必须可靠送达(邮件)
- 要验证 AI 对话、PDF 生成等对算力/时间有要求的场景

迁移成本很小:
1. 买一台 2核2G 阿里云 ECS + 4G swap
2. 改 `.env` 里 `CADDY_DOMAIN=你的域名` + `NODE_ENV=production` + 填 SMTP
3. 按 [alpha.md §1-§4](./alpha.md) 走

数据用 `docker compose exec postgres pg_dump` 导出再导入 VPS。

---

## 10. 常见坑

| 症状 | 原因 + 处理 |
|---|---|
| cloudflared 启不来 | `docker compose logs cloudflared`,大概是网络被封。换个 DNS 试试。 |
| 测试者打开 URL 504 Gateway Timeout | 你机器卡/休眠。用 `docker compose ps` 看容器还在不在 |
| 密码重置邮件收不到 | 预期 —— SMTP 没配。进 `docker compose logs app` 看 token 手工发给测试者 |
| 注册表单报 "机构未找到" | orgSlug 拼错。去 `docker compose exec postgres psql` 查 `select slug from organizations` |
| 浏览器 JS 看起来是旧的 | `docker compose build --no-cache app` 重建,再 `up -d app` |
| 上一次的 trycloudflare URL 还在,但访问不到 | URL 变了。`docker compose logs cloudflared` 看最新 URL |
