# Psynote Alpha 部署 Runbook

> **目标读者：** 第一次把 psynote 上 VPS 的人
> **目标产物：** 一个可公开访问的 HTTPS 域名，外部测试者能浏览器登录
> **预计耗时：** 熟手 1.5 小时；第一次跑大约 3-4 小时（含 DNS 传播等待）

---

## 0. 前置清单（开干前备好）

| 项 | 说明 |
|---|---|
| VPS | 2C4G 起步；推荐阿里云 ECS / 腾讯云 CVM / DigitalOcean 2 核 4G；选镜像 Ubuntu 22.04 LTS |
| 域名 | 一个你拥有的域名 + 一个子域（如 `app.psynote.example`）DNS 面板 |
| SMTP | 阿里云邮件推送 / 腾讯企业邮 / SendGrid 任一；**提前准备好发信域名的 SPF/DKIM** |
| AI Key（可选） | OpenAI 兼容 API key；不填则 AI 功能降级，不影响登录测试 |
| SSH 密钥 | 能登录 VPS 的 ssh key（避免密码登录） |

---

## 1. 准备 VPS（15-20 分钟）

```bash
# SSH 到 VPS，root 或能 sudo 的用户
ssh user@your-vps-ip

# 1.1 更新系统
sudo apt update && sudo apt upgrade -y

# 1.2 装 Docker + compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker   # 或退出重登

# 1.3 装基础工具
sudo apt install -y git ufw

# 1.4 防火墙:只开 22/80/443
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

**验证：**
- `docker ps` 能跑（无权限错误）
- `sudo ufw status` 显示 22/80/443 都 allow

---

## 2. 配置 DNS（5 分钟 + 最多 30 分钟传播）

在域名服务商面板加 A 记录：

```
类型  主机记录      解析值
A     app           <你的 VPS 公网 IP>
```

**验证：**
```bash
dig app.psynote.example +short    # 应返回 VPS 的 IP
# 或
nslookup app.psynote.example
```

DNS 没生效前不要往下走（Caddy 申请证书会失败）。

---

## 3. 克隆并配置（15 分钟）

```bash
# 3.1 拉代码
sudo mkdir -p /opt/psynote && sudo chown $USER /opt/psynote
cd /opt/psynote
git clone <你的 git 仓库 URL> .

# 3.2 复制 .env 模板并填值
cp .env.example .env
nano .env   # 或你习惯的编辑器
```

**必填字段（逐个）：**

```bash
CADDY_DOMAIN=app.psynote.example          # 你的域名,Caddy 申证书用
CLIENT_URL=https://app.psynote.example    # CORS 白名单 + 邮件链接基址
PUBLIC_BASE_URL=https://app.psynote.example

POSTGRES_PASSWORD=<openssl rand -hex 16>  # Postgres 密码
JWT_SECRET=<openssl rand -hex 48>         # JWT 签名密钥

SMTP_HOST=<邮件服务商的 SMTP>             # 如 smtpdm.aliyun.com
SMTP_PORT=587
SMTP_USER=<发信账号>
SMTP_PASS=<SMTP 密码>
SMTP_FROM=no-reply@psynote.example
```

**生成强随机值：**
```bash
openssl rand -hex 48   # for JWT_SECRET
openssl rand -hex 16   # for POSTGRES_PASSWORD
```

**验证：**
```bash
# 检查无变量缺失
grep -E '^(CADDY_DOMAIN|CLIENT_URL|POSTGRES_PASSWORD|JWT_SECRET|SMTP_HOST)=' .env | wc -l
# 应输出 5
```

---

## 4. 首次启动（10-20 分钟）

```bash
# 4.1 构建 + 启动
docker compose up -d --build

# 4.2 看构建和启动日志(app 会等 postgres/redis 健康,然后跑 drizzle migrate)
docker compose logs -f app
# 观察到 "[entrypoint] Starting server" 和 "Server listening on 0.0.0.0:4000"
# 按 Ctrl+C 退出日志流(不会停服务)

# 4.3 看 Caddy 证书申请
docker compose logs caddy
# 看到 "certificate obtained successfully" 表示 HTTPS 就绪
```

**验证：**
```bash
# API 健康
curl -fsS https://app.psynote.example/api/health
# 应返回 {"status":"ok","timestamp":"..."}

# 浏览器访问 https://app.psynote.example
# 应看到 psynote 登录页,HTTPS 锁正常
```

---

## 5. 跑自定义数据迁移（5 分钟）

> **注：** drizzle-kit migrate 已在 app 启动时跑过（仅覆盖 `server/drizzle/*.sql`）。
> `server/src/db/migrations/*.ts` 是自定义脚本，需手动跑一遍。

```bash
# 进容器
docker compose exec app sh

# 在容器里,按编号顺序跑(已跑过的会跳过,它们是幂等的)
for m in server/src/db/migrations/*.ts; do
  echo "▶ $m"
  npx tsx "$m"
done

# 或只跑指定版本
npx tsx server/src/db/migrations/026-role-architecture-skeleton.ts

exit
```

**验证：** 无报错即可。

---

## 6. 创建首个系统管理员（10 分钟）

```bash
# 进容器
docker compose exec app sh

# 容器内:跑自定义脚本直接插 system admin
# (psynote 现有 seed.ts 会建 demo 机构 + 管理员 + 咨询师,alpha 推荐直接用)
npx tsx server/src/seed.ts
exit
```

`seed.ts` 默认会建：
- 一个 demo 咨询机构 + 管理员 + 2 名咨询师 + 1 名来访者
- 一个 demo 学校 + 管理员
- 具体账号密码见 [server/src/seed.ts](../../server/src/seed.ts) 顶部

**立即改默认密码！** 登录后在 admin 后台给自己设一个强密码。

**验证：**
- 浏览器访问 `/login` → 用 seed 的 admin 账号登录
- 进 `/admin/tenants` 能看到 demo 机构
- 点 "创建新租户" 能走通 6 步向导，建一个真的 pilot 机构

---

## 7. 日常操作

```bash
# 更新代码 + 重新部署
cd /opt/psynote && ./scripts/deploy.sh

# 只看 app 日志
docker compose logs -f app

# 进数据库
docker compose exec postgres psql -U psynote

# 重启 app(配置变更后)
docker compose restart app

# 停机维护
docker compose down
# 重新起
docker compose up -d
```

---

## 8. 备份（alpha 阶段最小可用）

**手动备份到 VPS 本地 + 定期 scp 回你本机：**

```bash
# 在 VPS 上
docker compose exec -T postgres pg_dump -U psynote psynote | gzip > \
  /opt/psynote/backups/$(date +%Y%m%d-%H%M).sql.gz

# 恢复(紧急用)
gunzip -c backup-YYYYMMDD.sql.gz | docker compose exec -T postgres psql -U psynote psynote
```

**加 cron：**
```cron
# /etc/cron.d/psynote-backup
0 3 * * * ubuntu cd /opt/psynote && docker compose exec -T postgres pg_dump -U psynote psynote | gzip > backups/$(date +\%Y\%m\%d).sql.gz
```

production 前需要：S3/OSS 离线 + 加密。

---

## 9. 故障排查

| 症状 | 检查 |
|---|---|
| 访问域名 502 | `docker compose logs app` 看 server 是否起来 |
| Caddy 一直申请不到证书 | `docker compose logs caddy`；最常见：DNS 没生效或防火墙没开 443 |
| 登录后看"您尚未加入任何机构" | 刚注册的用户没有 org_members 行。alpha 里通用 /register 已禁,应用 `/register/counseling/:orgSlug` 或班级邀请链接 |
| 忘记密码邮件收不到 | `docker compose exec app sh` → `nc -zv $SMTP_HOST $SMTP_PORT` 测连通性；检查 SMTP 凭据 |
| 500 Server error | `docker compose logs app --tail 100` 看报错；常见是 migration 没跑 |
| 页面 JS 404 | Caddy 的 SPA fallback 写对了吗？看 Caddyfile |

---

## 10. 上线判据（完成这些再邀人测）

- [ ] 浏览器访问 https://域名 能看到登录页（HTTPS 锁正常）
- [ ] 用 seed 账号登录能进 admin 后台
- [ ] `/admin/tenants/new` 建一个 pilot 机构能走通
- [ ] 给新建机构加一个咨询师，该咨询师能登录并进主 app
- [ ] 咨询中心：访问 `/register/counseling/:orgSlug` 能注册来访者（此路径需 Phase C 完成）
- [ ] 学校：家长拿班级邀请码能走通绑定流程
- [ ] 所有人点"忘记密码"都能收到真实邮件（Phase B 完成）
- [ ] 登录页里的 "用户协议" "隐私政策" 链接不是 404（Phase E 完成）

---

## 11. 关闭 / 数据导出

```bash
# 干净停服
docker compose down

# 完整备份(结构 + 数据)
docker compose exec -T postgres pg_dump -U psynote psynote > full-backup.sql

# 彻底清掉(⚠️ 会删 volume 里的所有数据)
docker compose down -v
```
