# psynote 上线排期 — 2026 Q2

> **创建**: 2026-05-03
> **目标**: 第一个真实来访者进系统（counseling OrgType，自家机构 5-7 人）
> **目标日期**: 2026-06-14（W6 末，留 W6 整周作缓冲）
> **基线**: 5-6 周原排期 + 安全审计（10 必修 / 13 建议修）合并
> **配套文档**:
> - 安全审计报告：`docs/compliance/security-audit-2026-05-03.md`（待归档）
> - 系统设计：`docs/architecture/system-design.md`
> - PRD 模板：`docs/process/prd-template.md`

---

## 0. 前提与容量假设

### 0.1 团队容量
- **CTO**: 30-40 小时/周编码（合并 PR + review 时间在内）
- **创始人**: 编码上很少；主要做产品决策、内容（知情同意 / SOP / 培训）、外部协调（律师 / 服务器 / 律师审）
- **总编码容量**: 6 周 × 35h = **210h CTO 时**

### 0.2 工作量估算
| 类别 | 估算 | 占比 |
|---|---|---|
| 🔴 必修（含 PHI 加密 + npm 升级）| ~50h | 24% |
| 🟠 建议修（13 项）| ~45h | 21% |
| 原排期工程任务（部署 / 备份 / 邮件 / AI 水印 / 督导 UI / PHI 看板 / 危机兜底）| ~75h | 36% |
| Buffer / Code review / 调试 | ~40h | 19% |
| **合计** | **~210h** | 100% |

→ 6 周排期**刚好打住**，无缓冲。所以选 **Plan A**：必修全做，建议修做关键 5 项，剩余 8 项推迟到 W7-W8 上线后硬化。

### 0.3 滑期判定
- 任意一周滑 1-2 天：W6 缓冲吸收，继续
- 任意一周滑 3+ 天：**第一个来访者推迟一周**到 2026-06-21
- 24h 紧急项滑：禁止——这 3 件没补完任何其他工作都不要做

---

## 1. 整体日历

```
        May        |     June
W0  W1  W2  W3  W4 |  W5  W6
==  ==  ==  ==  == |  ==  ==
3   6   13  20  27 |  3   10  14  ← Day-1
↓
24h
紧急
        部署+      文件上传+    AI水印+      督导UI+        冻结+        缓冲+
        备份+      公开测评+    bcrypt+      锁仓+          培训+        Day-1
        dataScope  rate-limit   Cookie       SOP            外审
```

| 周 | 起止 | 主题 | 关键交付 | 上线门 |
|---|---|---|---|---|
| **W0** | 5/3-5/5 | ⚡ 紧急 | API key rotated / JWT 默认值修 / 公开注册修 | 3 项绿灯才进 W1 |
| **W1** | 5/6-5/12 | 部署底座 + dataScope 漏洞 | 真环境 + 备份 + Sentry + 3 处 dataScope + PHI 审计修 | 部署能跑 + 备份恢复演练过 |
| **W2** | 5/13-5/19 | 输入面收敛 | 文件上传 + 公开测评 + per-route rate limit + 危机兜底页 | 公开端点都至少有 token / captcha 之一 |
| **W3** | 5/20-5/26 | AI 合规 + 凭证迁移 | AI 水印铺开 + bcrypt 12 + JWT cookie | 25+ pipeline 全挂 AIBadge |
| **W4** | 5/27-6/2 | 督导 + 看板 + 政策 | 督导 UI 调好 + PHI 看板 + sysadmin break-glass + 内部 SOP | 督导本人 OK + 看板可查 |
| **W5** | 6/3-6/9 | 冻结 + 培训 + 复审 | 冻结 + 全员培训 + 重跑 security-review + 律师审定稿 | Day-1 上线检查清单全绿 |
| **W6** | 6/10-6/14 | 缓冲 + Day-1 | W1-W5 滑期吸收 + Day-1 6/14 | 第一个真实来访者签知情同意 |

---

## 2. W0 — 24-72h 紧急（5/3-5/5）

> 这 3 件**今天到周一**必须做完。不做完任何其他工作都没意义——你的 API key 已经被人爬走的概率大于 50%，你的 JWT 默认密钥就在公开仓库里。

| # | 任务 | Owner | 工时 | 完成判据 | 滑期成本 |
|---|---|---|---|---|---|
| 0.1 | rotate newcoin.top API key | **创始人** | 0.5h | 旧 key 在控制台已失效 + 新 key 通过 env 注入 | 攻击者继续盗刷你的余额；可能产生几百到几千元 token 费 |
| 0.2 | 删 `scripts/probe-ai-models.mjs:2` 和 `probe-ai-models-stress.mjs:3` 的硬编码 key，改读 `process.env.AI_API_KEY` | CTO | 0.5h | 两个文件不再有 `sk-` 字面量；脚本仍可跑 | 同上 |
| 0.3 | `server/src/config/env.ts:6` 改 `JWT_SECRET: z.string().min(32)`，删所有 fallback 默认值（3 处）| CTO | 1h | 服务在缺 env 时启动失败；prod / staging / test 三个环境都得显式注入 | 任何人能用公开默认值伪造 admin token；账户全失守 |
| 0.4 | 修公开注册账户接管：`counseling-public.routes.ts:124-160` + `eap-public.routes.ts:128-141` + `public-course-enroll.routes.ts:119` | CTO | 3h | existingUser 走 `bcrypt.compare(body.password, user.passwordHash)`；course 不再写 `passwordHash: randomUUID()` | 任何人知道 email + orgSlug 就能登入对应账户；不可上线 |

**W0 出口**：4 项全绿 → 进 W1。否则 W1 推迟。

---

## 3. W1 — 部署底座 + dataScope 漏洞（5/6-5/12）

| # | 任务 | Owner | 工时 | 完成判据 | 滑期成本 |
|---|---|---|---|---|---|
| 1.1 | 注册阿里云 / 腾讯云 ECS 2c4g + 域名 + **启动 ICP 备案** | 创始人 | 2h（+ 7-20 工作日等待）| 备案受理号拿到 | ICP 不下来域名解析不了，整体上线推迟 |
| 1.2 | Docker 部署到 ECS（已有 Dockerfile + compose） | CTO | 4h | HTTPS 可访问 + Caddy 自动 cert | 后续所有部署相关任务无法验证 |
| 1.3 | DB 整盘加密（云盘"系统盘加密"勾选 OR LUKS）+ 自动快照 03:00 每日 7 天保留 | CTO | 3h | 控制台显示已加密；快照列表至少 1 条 | PHI 静态合规失守 |
| 1.4 | off-site 备份脚本：每周 `pg_dump` + 加密 → 异地 OSS bucket | CTO | 4h | 跑过一次成功；从备份能 restore 出来 | 单点备份；硬盘故障 = 数据全失 |
| 1.5 | **演练 restore**：从备份恢复到一个临时 DB | CTO | 2h | restored DB 能读出 seed 数据 | "有备份"和"能恢复"是两件事，没演练等于没备份 |
| 1.6 | Sentry 接入（server + client）+ alert 到手机邮件 | CTO | 3h | 故意制造一个错误，Sentry 收到，邮件到 | 上线后出错你不知道 |
| 1.7 | `npm audit fix` — 修 `fastify@<5.8.4` CVE + `@fastify/static` 路径遍历 + bullmq/uuid/vite/esbuild 9 个 moderate | CTO | 2h | `npm audit` high/critical 归零 | CVE 暴露面 |
| 1.8 | Caddyfile 加安全 headers（HSTS / X-Frame-Options / X-Content-Type-Options nosniff / Referrer-Policy / CSP）| CTO | 1h | curl -I 能看到 5 条 header | XSS 缓解层缺失 |
| 1.9 | 修 dataScope 漏洞 #5：`crisis-case.routes.ts:58-94` 加 `dataScopeGuard` + 按 `assignedCounselorId` 过滤 | CTO | 3h | counselor 只能看到分给自己的危机案件；e2e 测试覆盖 | counselor 看全机构危机案件 PHI |
| 1.10 | 修 dataScope 漏洞 #6：`delivery/person-archive.routes.ts:25-43` 加 dataScopeGuard | CTO | 3h | 跨 caseload 用户档案 403 | 跨 caseload PHI 泄露 |
| 1.11 | 修 dataScope 漏洞 #7：`delivery/delivery.routes.ts:25-30` 加 scope filter | CTO | 2h | 服务实例聚合按 caseload 过滤 | 同上 |
| 1.12 | 修 PHI access log 静默失败：`middleware/audit.ts:70-72` 改成 audit insert 失败 → 503，OR 写入备份 append-only file/queue | CTO | 4h | 模拟 audit 表写入失败时，PHI 请求 503 不返回数据 | **合规违规**——审计行丢失但 PHI 已返回 |
| 1.13 | 接通 Nodemailer + SMTP 配置（生产环境）| CTO | 3h | 预约提醒邮件实际能发到来访者 | 来访者爽约风险 |
| 1.14 | 找律师审"知情同意书"+"隐私政策"模板 | 创始人 | 2h（自己）+ 1-2 周等回复 | 律师 sign-off | 法律风险 |

**W1 出口（5/12 周日）**：1.5 演练成功 + 1.6 Sentry 收到测试错误 + 1.9-1.12 dataScope 4 处全修 + 1.13 邮件能发出 → 进 W2。

---

## 4. W2 — 输入面收敛（5/13-5/19）

| # | 任务 | Owner | 工时 | 完成判据 | 滑期成本 |
|---|---|---|---|---|---|
| 2.1 | 文件上传 magic bytes 校验（用 `file-type` 包）+ 服务端 sanitize filename + `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff` | CTO | 6h | 上传 evil.pdf（实际是 HTML）→ 浏览器下载不渲染 | Stored XSS → cookie/JWT 被盗 |
| 2.2 | `/uploads/*` 加鉴权层（不再 `fastifyStatic` 直挂）：路由通过 → 验证用户对该 record 有读权限 → stream file | CTO | 4h | 退出登录无法访问 `/uploads/<orgId>/<uuid>.pdf` | PHI 文件公网可下 |
| 2.3 | 公开测评提交加 per-distribution token（推荐）OR captcha + per-IP rate limit（次选） | CTO | 6h | 没 token 的 POST 拒绝；同一 IP 60s 内超过 N 次 429 | 攻击者污染分析数据 + 触发 level_3/4 危机 pipeline |
| 2.4 | per-route rate limit：登录 5/15min（按 email+IP）/ 密码重置 3/15min / 公开注册 5/15min | CTO | 4h | curl 同一 email 第 6 次登录 429 | 暴力破解保护 |
| 2.5 | NAT 友好的 keyGenerator：`request.ip + (request.user?.id ?? '')` | CTO | 2h | 同 IP 不同用户互不干扰；e2e 多用户场景验证 | 学校 / EAP 场景下用户互锁 |
| 2.6 | 危机干预兜底页：22:00 后填测评 level_4 → 弹窗显示 24h 危机干预热线 | CTO | 4h | 测试用例触发后页面正确显示 | 来访者真在危机时无人接 = 真实临床事故 |
| 2.7 | sysadmin break-glass 协议设计：访问 PHI 必须输入理由 + 自动通知该案 counselor | CTO | 6h | sysadmin 访问 session_notes 触发邮件给案主咨询师 | 内部信任设计缺失 — 你能看任何 counselor 的对话记录 |
| 2.8 | 修 group 公开签到验证 instance：`public-enroll.routes.ts:288-334` 加 `WHERE enrollmentId AND instanceId = :instanceId` | CTO | 1h | 攻击者用别 group 的 enrollmentId 签到 → 404 | 任意签到伪造 |
| 2.9 | 修 referral download token 改 single-use（设 `downloadedAt` 后失效）| CTO | 2h | 同一 token 第二次下载 410 | 链接泄露后可永久重放 7 天 |
| 2.10 | 修 email 枚举：counseling/eap public 注册的 `already_registered` 状态统一返回 | CTO | 2h | 已注册 vs 未注册响应体一致 | 邮箱目录被批量收割 |

**W2 出口（5/19 周日）**：2.1 + 2.2 + 2.3 + 2.4 → 进 W3。其余可滑到 W3 并行。

---

## 5. W3 — AI 合规 + 凭证迁移（5/20-5/26）

| # | 任务 | Owner | 工时 | 完成判据 | 滑期成本 |
|---|---|---|---|---|---|
| 3.1 | AI 水印铺开：25+ pipeline 全部输出写 `ai_provenance` + 前端挂 `<AIBadge>`（按 surface 优先级：SOAP / 督导 / 风险检测 / 课程生成 / 报告 narrative）| CTO | 16h | 任意 AI 输出在 UI 上能看到紫色"AI 生成"标识 | **临床伦理违规**——咨询师把 AI 输出当临床判断 |
| 3.2 | bcrypt cost 10 → 12（新用户用 12；老用户登录时若 cost 是 10 → re-hash）| CTO | 3h | `bcrypt.hash` 调用全用 12；e2e 验证登录仍 OK | PHI 处理者标准未达 |
| 3.3 | JWT 迁移：refresh token → httpOnly cookie / accessToken 内存 / 删 localStorage 持久化 | CTO | 10h | 客户端 localStorage 无 `psynote-auth` 项；refresh 走 cookie | XSS 偷 token = 全 PHI 失守 |
| 3.4 | JWT 算法 pin：`jwt.verify(..., { algorithms: ['HS256'] })` | CTO | 0.5h | grep 所有 verify 调用都加了 algorithms | 防御深度 |
| 3.5 | `/logout` 实现真实吊销：`revoked_tokens` 表 by jti，refresh rotate | CTO | 8h | logout 后用旧 refresh 401 | 7-30 天窗口期内被盗 token 可用 |

**W3 出口（5/26 周日）**：3.1 至少完成 SOAP / 督导 / 风险检测 3 个 surface（其他可推 W4）+ 3.3 完成 + 3.5 完成 → 进 W4。

---

## 6. W4 — 督导 UI + PHI 看板 + 政策（5/27-6/2）

| # | 任务 | Owner | 工时 | 完成判据 | 滑期成本 |
|---|---|---|---|---|---|
| 4.1 | 督导（你的督导本人）现场试用 1 小时 → 记录痛点 | 创始人 + 督导 | 1h | 痛点列表 + 优先级排序 | 上线后督导嫌烦不用，督导工作流空转 |
| 4.2 | 按 4.1 反馈调督导 UI（批量 review / 逐条留批注 / 反馈回流）| CTO | 8h | 督导 1 小时能清完一周 125 sessions 积压 | 同上 |
| 4.3 | PHI 访问看板 UI：`AuditLogViewer` 强化 + `phi_access_logs` 可视化 + 按 user / 时间 / 资源筛选 | CTO | 12h | 创始人能在 5 分钟内查出"上周谁看了来访者 X 的记录" | 合规事故时拿不出证据链 |
| 4.4 | dataRetention worker：`organizations.dataRetentionPolicy` 字段被读、按期 hard-delete 软删除行 | CTO | 8h | 测试机构设 1 天保留期 → cron 跑后旧数据真消失 | 合规要求"超期清除" |
| 4.5 | 内部 SOP 文档（备份恢复 / 出错升级 / sysadmin 权限边界 / 双重关系处理）| 创始人 | 6h | 4 份独立 SOP 在共享文档库 | 出事时无章可循 |
| 4.6 | 测评工具版权 confirm：列出当前用了哪些量表 → 检查每个授权状态（PHQ-9/GAD-7 free / SCL-90/MMPI 需采购）| 创始人 | 3h | 表格列出每量表 + 授权状态 + 采购需求 | 版权法律风险 |
| 4.7 | parent binding rate limit：phoneLast4 尝试限制 5 次/小时/班级 token，超过锁定 | CTO | 3h | 暴力 phoneLast4 被 429 | 学生家长信息可被批量推断 |

**W4 出口（6/2 周日）**：4.1 督导反馈拿到 + 4.2 督导可用 + 4.3 看板可查 + 4.5 SOP 写完 → 进 W5。

---

## 7. W5 — 冻结 + 培训 + 复审（6/3-6/9）

> **冻结期规则**：W5 起只修 P0 bug，不接新需求。任何"我觉得加个 X 更好"的想法 → Section D 决策日志记录、W7+ 处理。

| # | 任务 | Owner | 工时 | 完成判据 | 滑期成本 |
|---|---|---|---|---|---|
| 5.1 | 重跑 `/security-review` skill，验证 W0-W4 修完的 17 项无 regression | CTO | 4h | 报告里 W0-W4 修过的项不再出现 | 修了的东西又破了 |
| 5.2 | （可选）外部第三方渗透测试 — 找一个懂安全的朋友 / 安全公司做 1 天黑盒 | 创始人外联 | $$ 视预算 | 报告 + 关键漏洞复测 | 内部审计盲区 |
| 5.3 | 全员培训 1 小时（你 + 3-5 咨询师 + 1 督导 + 行政）| 创始人 | 1.5h（含准备）| 每人跑通 1 个 dummy 个案 | 上线日没人会用 |
| 5.4 | 跑 2-3 个 dummy 个案做端到端检验：派单 → 测评 → 督导审核 → 协议签署 → 随访 | CTO + 全员 | 4h | 完整链路无 bug | 真上线撞 bug |
| 5.5 | 律师审完隐私政策 / 知情同意定稿 + 把模板入库 | 创始人 | 2h | 模板挂在系统中可发送 | 法律暴露面 |
| 5.6 | Day-1 上线检查清单全部确认（见 §8）| 创始人 + CTO | 2h | 12/12 项全绿 | 准备不足 |

**W5 出口（6/9 周二）**：所有项绿灯 → 进 W6 缓冲 → Day-1 上线。

---

## 8. W6 — 缓冲 + Day-1（6/10-6/14）

| # | 任务 | 备注 |
|---|---|---|
| 6.1 | W1-W5 滑期吸收 | 留 4 个工作日缓冲 |
| 6.2 | 6/13 周六 dry-run：两人模拟来访者签知情同意进系统全流程 | 不进真实 PHI |
| 6.3 | **Day-1 = 6/14 周一**：第一个真实来访者签知情同意 → 进系统 | 创始人 on-call 全周 |
| 6.4 | Day-1 后 7 天：每天 30 min 看 Sentry / phi_access_logs / 当日反馈 | 异常立刻处理 |

---

## 9. Day-1 上线检查清单（W5 末必须全绿）

复制这一段到一个清单工具（飞书 / Notion）逐项打钩：

### 工程
- [ ] 备份能恢复（W1.5 演练通过）
- [ ] Sentry 在收报错（W1.6 确认）
- [ ] DB 整盘加密 已开
- [ ] `npm audit` high/critical = 0
- [ ] 所有 W0-W2 必修项过 e2e 测试
- [ ] AI 水印挂在所有 AI 输出 surface（W3.1）
- [ ] PHI 访问看板可查询（W4.3）
- [ ] sysadmin break-glass 流程上线（W2.7）
- [ ] 危机兜底页面（真实危机干预热线，**不是**"请联系咨询师"）
- [ ] dataRetention worker 已部署但配置成"暂不清理"（首批数据先不删）

### 政策 / 法律
- [ ] 知情同意 / 隐私政策 律师 sign-off
- [ ] 测评工具版权 confirm
- [ ] 内部 SOP 4 份完成

### 团队
- [ ] 督导本人 OK 用（W4.1-4.2）
- [ ] 全员培训 1 小时跑过 dummy 个案
- [ ] 创始人 on-call 第一周（手机 24h 在线 / Sentry alert 直达）

### 安全复审
- [ ] `/security-review` 重跑，W0-W4 修过项无 regression（W5.1）

---

## 10. 推迟到 W7+（上线后硬化）

> 这些是 🟠 建议修里**不影响 5-7 人小机构 day-1 安全**的项。明确推迟、不假装做完。

| # | 任务 | 推迟原因 | 重新评估时间 |
|---|---|---|---|
| 10.1 | bcrypt cost 12 强制 re-hash 老账户 | 5-7 人都重新建账户，自然就是 12 | W8 |
| 10.2 | 6 字符密码最小 → 8 字符 + 强度校验 | 修起来简单但需要全员重设密码，运营成本 | W8 |
| 10.3 | `requirePermission()` 实装 OR 删除 | 当前是 stub，无路由依赖 | W10 |
| 10.4 | Docker 内网 plaintext → TLS | 单机部署没必要，多机时再做 | 多机部署前 |
| 10.5 | `audit_logs.orgId/userId` 强制非空 | 系统级事件需要重设计才能改 | W10 |
| 10.6 | 完整 Information Disclosure 修（404 vs 410 时序、approvedCount 等）| 低危且易破坏 UX | W10 |
| 10.7 | 第三方持续依赖监控（Snyk / Dependabot）| 需配置但不紧急 | W8 |
| 10.8 | gitleaks pre-commit hook | 防止再泄露 secret | W8 |

---

## 11. 协作节奏（6 周内雷打不动）

| 频率 | 时间 | 谁 | 内容 |
|---|---|---|---|
| **每周一 9:00 (30min)** | 周计划 | 创始人 + CTO | 上周完成 / 本周计划 / blockers / 滑期评估 |
| **每周五 17:00 (15min)** | 周复盘 | 创始人 + CTO | 本周交付 vs 计划 / 下周滑期风险 |
| **每日 21:00 起 (5min)** | 站会 | CTO 自报 | Sentry 是否清空 / 当日交付 |
| **W3 起每周三 (15min)** | 与督导对齐 | 创始人 + 督导 | 督导工作流试用反馈（W3 起每次都同步进展）|

---

## 12. 风险登记 / 滑期触发条件

| 风险 | 触发条件 | 应对 |
|---|---|---|
| ICP 备案超期（>20 工作日）| 5/27 后还没拿到 | 临时用 ECS IP 直连 + 设 CSP 兼容 IP；或租已备案域名 |
| AI 水印 25+ pipeline 实际工作量爆表 | W3 末仅完成 < 5 个 | 砍：先接最高风险 surface（SOAP / 督导 / 风险检测），其他 W7+ 补 |
| 督导反馈"用不了" | 4.1 反馈 ≥ 3 个阻塞性问题 | 4.2 工时翻倍；如仍不行则上线先用 spreadsheet + 系统并行 |
| 律师审 ≥ 3 周 | 5/24 后仍无回复 | 找第二个律师并行；用国内成熟模板（壹心理 / 简单心理公开模板）做兜底 |
| Day-1 周内出 P0 bug | 任何来访者反馈"系统坏了" | 全员停工修；如 ≥ 4h 不能修 → 临时下线，纸笔承接 1-3 天 |
| 第一来访者突发危机（系统层面）| 危机告警未触发 OR 触发但响应链没人接 | 当周 on-call 升级；外部督导紧急介入；事后 RCA 1 周内完成 |

---

## 13. 给创始人的 5 条纪律（贴在工位上）

1. **W5 是冻结期**——任何"突然想到加 X"先记决策日志，W7 再说
2. **24h 紧急项不动完不要动其他事**——Day 0 的 4 件事是 prerequisite
3. **滑期不延任务，延 Day-1 日期**——堆积比承认延期更危险
4. **每周五看 Sentry 一遍，不只是出事时看**——预防性观察
5. **督导反馈是平台 ROI 的天花板**——督导嫌烦 = 平台无价值；W4.1 那 1 小时是整个排期里最重要的 1 小时

---

## 14. 修订记录

| 日期 | 修订 | 谁 |
|---|---|---|
| 2026-05-03 | 初版（基于安全审计 + 5-6 周原排期合并）| CTO（顾问 AI）|
