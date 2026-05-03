# Psynote 系统设计（详细版）

> **快照时间**: 2026-04-30 PR #1 merge 之后（merge commit `1ae4195`）
> **作用域**: 全栈 — 前端 / 后端 / 数据模型 / AI 子系统 / 跨切关注点 / 部署
> **配套文档**:
> - `docs/architecture.md` — 早期版（2026-Q1 之前），mermaid 图，仍有过时内容（如"30+ tables"，实际已 75 张）
> - `docs/architecture/role-authorization.md` — 角色授权专题
> - `memory/project_gap_analysis_2026Q2.md` — 战略 Gap 分析
> 本文档替代 `architecture.md` 作为当前 single source of truth。

---

## 0. TL;DR

psynote 是**面向心理服务单位的横向平台**——"心理服务单位"是上位概念，**不等于咨询机构**。当前覆盖 5 类 OrgType：学校 / 咨询机构 / 企业 EAP / 个体咨询师 / 医院（占位）；未来可向社区、戒毒所、监狱、军队、公益热线、政务心理援助等扩展。

5 类 OrgType **共用一套核心能力**（个案、测评、团辅、课程、知识库、合规、AI 管线），OrgType-specific 业务对象通过独立表叠加（`school_*`、`eap_*`、`class_parent_invite_tokens` 等），不污染主链。

架构上是经典 React + Fastify + Postgres，特殊设计集中在 4 处：

1. **`launch.service.ts` 是平台单点入口**——6 种 actionType 把"决策→实例化"统一，所有 OrgType 复用
2. **`rule-engine` + `candidate_pool` 是平台护城河**——AI/规则的产物沉淀给人决策，不直接执行外部动作（合规边界）
3. **`org_members` 双层角色模型 + DB trigger**——legacy `OrgRole` 与 V2 `RoleV2`（per-OrgType 字典）并存，DB trigger 强约束跨 OrgType 角色不串
4. **PHI 访问独立 `phi_access_logs`**——区别于通用 `audit_logs`，每次访问 PHI 数据冻结当时角色快照

总表数：**75 张**。30 个 migration。33 个 AI pipeline。26 个 server module。18 个 client feature。14 个 e2e spec。292 个单元测试。

---

## 0.1 OrgType 矩阵（产品坐标系）

| OrgType | 买单方 | 服务对象 | OrgType-specific 资产 | 实装 |
|---|---|---|---|---|
| `school` | 学校（中小学 / 高校 / 教育局） | 学生 / 家长 | `school_classes`、`school_student_profiles`、`class_parent_invite_tokens`、`client_relationships` | ✅ |
| `counseling` | 心理咨询机构 / 中心 | 来访者 | `care_episodes` 主链 + clinic_admin / supervisor / counselor 角色集 | ✅ |
| `enterprise` | 企业 HR / EAP 经理 | 员工 | `eap_partnerships`、`eap_counselor_assignments`、`eap_employee_profiles`、`eap_usage_events`、`eap_crisis_alerts` | ✅ |
| `solo` | 个体咨询师 | 来访者 | owner 单角色，复用 counseling 主链 | ✅ |
| `hospital` | 精神科 / 心理科 | 患者 / 家属 | （占位，未实装） | 🔴 |
| **未来扩展** | 社区 / 戒毒所 / 监狱 / 军队 / 公益热线 / 政务 12345 心理援助 | 各类服务对象 | 沿用 5 类 OrgType + 加新类型 | — |

### 0.2 横向平台的 4 条架构原则

1. **L1 专业生产力**（个案 / 测评 / 团辅 / 课程 / 记录 / 协议 / 随访 / AI 管线）—— **所有 OrgType 共享**，无分支
2. **L2 交付平台**（知识库 → launch.service → Portal）—— **所有 OrgType 共享**，actionType 集合不按 OrgType 分叉
3. **L3 机构协作** 的**机制**（角色 / 权限 / 审计 / 数据范围）所有 OrgType 共享；**实例**（具体角色集、数据范围规则）per-OrgType 配置
4. **OrgType-specific 业务对象**（班级、EAP 合作、学生家长关系、危机告警）走**独立表**叠加，**禁止**在主链表里加 `if orgType === 'school'` 分支字段

> **判定新需求归属**：
> - 落在 L1/L2 主链 → 必须**所有 OrgType 通用**才能进
> - 仅一个 OrgType 用 → 走 OrgType-specific 表
> - 跨 2-3 个 OrgType → 进主链但加 nullable 字段；跨 4+ → 直接进主链

---

## 1. 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 前端框架 | React + Vite + TypeScript | React 19.2 |
| 前端状态 | Zustand（UI 态） + TanStack Query（服务端缓存） | — |
| 前端样式 | Tailwind CSS | — |
| 后端框架 | Fastify + TypeScript | Fastify 5 |
| ORM | Drizzle | — |
| 数据库 | PostgreSQL | — |
| 队列 / 缓存 | BullMQ + Redis | — |
| AI | OpenAI Compatible API | gpt-4o 默认 |
| 认证 | 自建 JWT（bcrypt + jsonwebtoken） | — |
| 邮件 | Nodemailer | — |
| Monorepo | npm workspaces | — |
| 测试 | Vitest（单元 / 集成）+ Playwright（e2e） | Vitest 4 / Playwright 1.59 |
| 部署（推荐） | Docker + Caddy（已有 `Dockerfile` + `Caddyfile` + `docker-compose.yml`） | — |

---

## 2. Monorepo 布局

```
psynote/
├── client/                React 19 前端（独立 workspace）
│   └── src/
│       ├── app/           路由 + RoleBasedHome 角色分流
│       ├── features/      18 个领域模块（见 §4）
│       ├── api/           API client + React Query hooks
│       ├── stores/        Zustand 全局状态
│       └── shared/        AIBadge / WorkspaceLayout 等横切组件
├── server/                Fastify 5 后端（独立 workspace）
│   └── src/
│       ├── app.ts         Fastify factory（buildApp）
│       ├── server.ts      生产入口 + BullMQ worker
│       ├── config/        env / database / queues
│       ├── db/
│       │   ├── schema.ts  Drizzle 单文件定义全部 75 张表
│       │   └── migrations/  005 ~ 030（30 个迁移）
│       ├── middleware/    12 个中间件（见 §6）
│       └── modules/       26 个业务模块（见 §5）
├── packages/shared/       共享类型 + 权限策略（独立 workspace）
│   └── src/
│       ├── types/         域类型 + enums
│       ├── auth/          RoleV2 / Principal / Policy
│       └── schemas/       通用配置 schema（如 triage-config）
├── e2e/                   Playwright 测试（14 spec / 7 角色 storageState）
├── scripts/               dev-status 等工具脚本
├── docker-compose.yml     Postgres + Redis + app 一键起
├── Dockerfile             多阶段构建
├── Caddyfile              反向代理 + 自动 HTTPS
└── docs/
    ├── architecture.md            （早期版）
    ├── architecture/
    │   ├── system-design.md       （本文档）
    │   └── role-authorization.md  （角色授权专题）
    ├── process/
    │   └── prd-template.md        （PRD 模板 + 协作规则）
    ├── deployment/                部署文档
    ├── compliance/                合规相关
    └── qa/                        测试与 QA
```

**重要约定**：`@psynote/shared` package 的 `main` 指向 `dist/index.js`，意味着所有跑代码的 CI job 都得 `npm run build --workspace=@psynote/shared`，否则 vite dynamic import 会挂（详见 `engineering_lesson_ci_e2e_build_shared_2026Q2`）。

---

## 3. 整体架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      用户层 (Browser)                                     │
│  按 Principal 分流（跨 OrgType 复用同一前端骨架）：                            │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Staff（执业 / 管理岗）                                                 │  │
│  │   counseling : clinic_admin / supervisor / counselor                  │  │
│  │   school     : school_admin / school_leader / psychologist /         │  │
│  │                homeroom_teacher                                       │  │
│  │   enterprise : hr_admin / eap_consultant                              │  │
│  │   solo       : owner                                                  │  │
│  ├────────────────────────────────────────────────────────────────────┤  │
│  │ Subject（服务对象 — Portal 自视角）                                     │  │
│  │   client（咨询） / student（学校） / employee（企业） / patient（医院）   │  │
│  ├────────────────────────────────────────────────────────────────────┤  │
│  │ Proxy（监护 — Portal 监护视角）                                        │  │
│  │   parent / family                                                     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │ HTTPS (Caddy 反代 + 自动 cert)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      前端 (Vite dev :5173 / 静态资源 prod)                │
│                                                                         │
│  app/App.tsx                                                            │
│   └─ RoleBasedHome  (按 principalClass + role 路由到对应 shell)            │
│       ├─ /research-triage    ResearchTriagePage  (三栏决策工作面)          │
│       ├─ /collaboration      OrgCollaboration    (派单 / 督导 / 审计)     │
│       ├─ /episodes/:id       CaseWorkbench       (个案工作面)             │
│       ├─ /portal/*           Client Portal       (来访者 4-tab)         │
│       └─ ...                                                            │
│                                                                         │
│  features/  （18 个）                                                     │
│    admin / assessment / auth / collaboration / counseling / courses /   │
│    dashboard / delivery / dev / groups / knowledge / legal / me /       │
│    notifications / research-triage / settings / staff / workflow        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │ JSON over /api/*
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              后端 (Fastify 5 :4000)                                      │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  中间件管道（per-route 组合）                                        │  │
│  │  cors → rate-limit → auth(JWT) → org-context → rbac →            │  │
│  │  data-scope → require-seat → audit                                │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  核心 Service Layer                                                │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │  launch.service.ts ⭐                                        │  │  │
│  │  │  6 actionType 单点入口：launch_course / launch_group /        │  │  │
│  │  │  create_episode / send_assessment / send_consent /            │  │  │
│  │  │  create_referral                                              │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │  rule-engine.service.ts                                      │  │  │
│  │  │  assessment_result.created → conditions → actions           │  │  │
│  │  │  (assign_course 自动 / 其他写 candidate_pool)                  │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │  delivery.service.ts                                         │  │  │
│  │  │  4 类服务实例聚合（counseling/group/course/assessment）        │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │  triage-automation.service.ts                                │  │  │
│  │  │  AI 解读 + 写 ai_provenance + 触发 rule-engine                 │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  AI 子系统 (server/src/modules/ai)                                 │  │
│  │  33 pipelines: triage / soap-analysis / supervision /              │  │
│  │  risk-detection / treatment-plan / interpretation /                 │  │
│  │  course-authoring / report-narrative / ... + ai-call-logs            │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  后台任务 (BullMQ workers, server.ts 启动)                           │  │
│  │  appointment-reminder（已有）/ follow-up-scheduler（待补） / ...      │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                  │              │                │
                  ▼              ▼                ▼
            ┌──────────┐   ┌──────────┐    ┌──────────────┐
            │ Postgres │   │  Redis   │    │ OpenAI Compat│
            │ ~75 tbl  │   │ Queue +  │    │  API         │
            │ Drizzle  │   │ Cache    │    │  (gpt-4o)    │
            └──────────┘   └──────────┘    └──────────────┘
```

---

## 4. 前端架构

### 4.1 路由分流 — `app/App.tsx` + `RoleBasedHome.tsx`

登录后，根据 `(orgType, role, principalClass)` 三元组决定 shell：

| Principal | 典型角色 | Shell | 入口路由 |
|---|---|---|---|
| `staff` | clinic_admin / counselor / supervisor / school_admin / psychologist | 主 App | `/` → 角色 dashboard |
| `subject` | client / student / employee | Portal | `/portal/*` |
| `proxy` | parent / family | Portal（家长视角） | `/portal/children/:id/*` |

`RoleBasedHome` 是单点决策器。新增角色 / 新增 dashboard 必须修改这里。

### 4.2 Feature 模块（18 个）

| Feature | 服务对象 | 主要路径 |
|---|---|---|
| `assessment/` | 咨询师 / 管理员 | 量表库、测评创建、结果查看 |
| `counseling/` | 咨询师 | CaseWorkbench、EpisodeDetail、SessionNoteForm |
| `groups/` | 咨询师 | GroupCenter、方案库、活动管理 |
| `courses/` | 咨询师 | CourseCenter、Blueprint、LessonEditor |
| `knowledge/` | 全员（资产库） | 6 类资产 tab（量表 / 治疗目标 / 协议 / 团辅方案 / 课程 / 笔记模板） |
| `research-triage/` | 咨询师 | ⭐ 三栏决策工作面（候选 → 数据 → 操作） |
| `collaboration/` | org_admin / supervisor | OrgCollaboration（派单 / 督导待审 / 审计 / 转介接收） |
| `delivery/` | 咨询师 | 交付中心（4 类服务实例统一视图） |
| `dashboard/` | org_admin | 5 KPI 概览 |
| `admin/` | system_admin | 多机构 / license / 系统库 |
| `auth/` | 全员 | 登录 / 注册 / 密码重置 |
| `me/` | 全员 | 个人资料 |
| `settings/` | org_admin | 机构设置 / branding / 提醒 |
| `notifications/` | 全员 | 通知中心 |
| `staff/` | org_admin | 成员管理 |
| `workflow/` | org_admin | 规则管理（**UI 待补**） |
| `client-portal/`（在 features 之外，由 `app/scene/portal-shell` 挂载）| client / student | 4-tab 来访者门户 |
| `legal/` | 全员 | 法律页面（隐私政策 / 知情同意） |
| `dev/` | 开发 | 仅 dev 环境的工具页 |

### 4.3 状态管理

- **Zustand**: 全局 UI 态（当前用户、orgId、currentEpisode 等会话级状态）
- **TanStack Query**: 服务端态（默认 staleTime 5min，invalidate 走 mutation onSuccess）
- **不要在组件 useState 持有跨页面状态** —— 走 Zustand

### 4.4 共享组件（`shared/components`）

- `<AIBadge provenance={...}>` —— AI 输出水印（紫色 / 已审核绿色）
- `<WorkspaceLayout>` —— 三栏工作面（可调宽 + 独立 scroll）
- `<AuditLogViewer>` —— 审计日志可视化（起步状态）
- `<DataTable>` / `<EmptyState>` / `<RiskBadge>` —— 通用 UI 原语

---

## 5. 后端模块（26 个）

按 `app.ts` 中 `app.register(...)` 顺序：

### 平台 / 身份（4）
| Module | 路径前缀 | 职责 |
|---|---|---|
| `auth/auth.routes.ts` | `/api/auth` | 登录 / 注册 / refresh |
| `auth/password-reset.routes.ts` | `/api/auth` | 密码重置（一次性 token） |
| `user/user.routes.ts` | `/api/users` | self-service `/me` |
| `org/org.routes.ts` | `/api/orgs` | 机构 CRUD + 成员 |

### 测评（6）
| Module | 路径前缀 | 职责 |
|---|---|---|
| `assessment/scale.routes.ts` | `/api/orgs/:orgId/scales` | 量表 |
| `assessment/assessment.routes.ts` | `/api/orgs/:orgId/assessments` | 测评模板 |
| `assessment/result.routes.ts` | `/api/orgs/:orgId/results` + `/api/public/assessments` | 结果（含公开提交） |
| `assessment/batch.routes.ts` | `/api/orgs/:orgId/assessment-batches` | 批量施测 |
| `assessment/report.routes.ts` | `/api/orgs/:orgId/reports` | 报告生成 |
| `assessment/distribution.routes.ts` | `/api/orgs/:orgId/assessments/:id/distributions` | 分发链接 |

### 咨询（12）
| Module | 路径前缀 | 职责 |
|---|---|---|
| `counseling/episode.routes.ts` | `/api/orgs/:orgId/episodes` | 个案 |
| `counseling/appointment.routes.ts` | `/api/orgs/:orgId/appointments` | 预约 |
| `counseling/availability.routes.ts` | `/api/orgs/:orgId/availability` | 可约时段 |
| `counseling/session-note.routes.ts` | `/api/orgs/:orgId/session-notes` | 会谈记录 |
| `counseling/note-template.routes.ts` | `/api/orgs/:orgId/note-templates` | 笔记模板 |
| `counseling/goal-library.routes.ts` | `/api/orgs/:orgId/goal-library` | 治疗目标库 |
| `counseling/client-profile.routes.ts` | `/api/orgs/:orgId/clients` | 来访者档案 |
| `counseling/treatment-plan.routes.ts` | `/api/orgs/:orgId/treatment-plans` | 治疗计划 |
| `counseling/ai-conversation.routes.ts` | `/api/orgs/:orgId/ai-conversations` | AI 对话归档 |
| `counseling/client-assignment.routes.ts` | `/api/orgs/:orgId/client-assignments` | 来访者派单 |
| `counseling/client-access-grant.routes.ts` | `/api/orgs/:orgId/client-access-grants` | 跨咨询师访问授权 |
| `counseling/counseling-public.routes.ts` | `/api/public/counseling` | 公开咨询入口（无需登录） |

### 团辅 / 课程 / 内容（8）
| Module | 路径前缀 | 职责 |
|---|---|---|
| `group/scheme.routes.ts` | `/api/orgs/:orgId/group-schemes` | 团辅方案 |
| `group/instance.routes.ts` | `/api/orgs/:orgId/group-instances` | 团辅活动 |
| `group/enrollment.routes.ts` | `/api/orgs/:orgId/group-instances` | 报名 |
| `group/session.routes.ts` | `/api/orgs/:orgId/group-instances` | 团辅会次 |
| `group/public-enroll.routes.ts` | `/api/public/groups` | 公开报名（无需登录） |
| `course/course.routes.ts` | `/api/orgs/:orgId/courses` | 课程模板 |
| `course/instance.routes.ts` | `/api/orgs/:orgId/course-instances` | 课程实例 |
| `course/...` | 同上 | feedback / homework / public enroll |
| `content-block/` | `/api/orgs/:orgId/content-blocks` | C 端可消费内容块 |
| `enrollment-response/` | `/api/orgs/:orgId/enrollment-responses` | 学员答题 / 反思响应 |

### 交付 / 协作 / 工作流（5）
| Module | 路径前缀 | 职责 |
|---|---|---|
| `delivery/delivery.routes.ts` | `/api/orgs/:orgId` | 4 类服务实例聚合 |
| `delivery/launch.service.ts` | _platform service, not a route_ | ⭐ 6 actionType 单点入口（被 triage / collaboration / workflow 调用） |
| `delivery/person-archive.routes.ts` | `/api/orgs/:orgId/people` | 跨模块个人历史 |
| `collaboration/collaboration.routes.ts` | `/api/orgs/:orgId/collaboration` | 派单 / 督导 / 审计 |
| `workflow/workflow.routes.ts` | `/api/orgs/:orgId/workflow` | 规则引擎 |
| `triage/triage.routes.ts` | `/api/orgs/:orgId/triage` | 研判分流工作面 |
| `crisis/crisis-case.routes.ts` | `/api/orgs/:orgId/crisis` | 危机处置案件 |

### 合规 / 转介 / 随访（4）
| Module | 路径前缀 | 职责 |
|---|---|---|
| `compliance/consent.routes.ts` | `/api/orgs/:orgId/compliance` | 协议模板 + 签署 |
| `compliance/compliance-review.routes.ts` | 同上 | AI 合规审核 |
| `referral/referral.routes.ts` | `/api/orgs/:orgId/referrals` | 转介 |
| `referral/public-referral.routes.ts` | `/api/public/referrals` | 转介公开下载（token-gated） |
| `follow-up/follow-up.routes.ts` | `/api/orgs/:orgId/follow-up` | 随访计划 |

### AI / 通知 / 上传（4）
| Module | 路径前缀 | 职责 |
|---|---|---|
| `ai/ai.routes.ts` | `/api/orgs/:orgId/ai` | AI 服务总入口（生成 / 解读 / 督导） |
| `ai/ai.routes.ts` adminAi | `/api/admin/ai` | 平台库作者 AI |
| `notification/notification.routes.ts` | `/api/orgs/:orgId/notifications` | 站内通知 |
| `notification/reminder-settings.routes.ts` | `/api/orgs/:orgId/reminder-settings` + `/api/public/appointments` | 预约提醒设置 + 公开确认 |
| `upload/upload.routes.ts` | `/api/orgs/:orgId/upload` | 文件上传 |

### 来访者 Portal / 家长 / 学校 / EAP（多）
| Module | 路径前缀 | 职责 |
|---|---|---|
| `client-portal/client.routes.ts` | `/api/orgs/:orgId/client` | 来访者 4-tab |
| `parent-binding/*` | `/api/orgs/:orgId/school/classes/:classId/parent-invite-tokens` + `/api/public/parent-bind` | 家长自助绑定 |
| `parent-binding/portal-children.routes.ts` | `/api/orgs/:orgId/client/children` | Portal 家长视角 |
| `school/school-class.routes.ts` | `/api/orgs/:orgId/school/classes` | 班级 |
| `school/school-student.routes.ts` | `/api/orgs/:orgId/school/students` | 学生 |
| `school/school-analytics.routes.ts` | `/api/orgs/:orgId/school/analytics` | 学校 dashboard |
| `eap/eap-partnership.routes.ts` | `/api/orgs/:orgId/eap/partnerships` | 企业 EAP 合作 |
| `eap/eap-assignment.routes.ts` | 同上 `/assignments` | 咨询师指派 |
| `eap/eap-analytics.routes.ts` | 同上 `/analytics` | EAP 数据看板 |
| `eap/eap-public.routes.ts` | `/api/public/eap` | 员工自助注册 |

### 系统管理（4）
| Module | 路径前缀 | 职责 |
|---|---|---|
| `admin/admin.routes.ts` | `/api/admin` | 平台管理 |
| `admin/admin-license.routes.ts` | `/api/admin/licenses` | License 颁发 |
| `admin/admin-tenant.routes.ts` | `/api/admin/tenants` | 多机构管理 |
| `admin/admin-dashboard.routes.ts` | `/api/admin/dashboard` | 平台 KPI |
| `admin/admin-library.routes.ts` | `/api/admin/library` | 平台级资产库 |
| `org/branding.routes.ts` | `/api/orgs/:orgId` | 品牌设置 |
| `org/dashboard.routes.ts` | `/api/orgs/:orgId` | 机构 dashboard |
| `org/license.routes.ts` | `/api/orgs/:orgId` | 激活 license |
| `org/subscription.routes.ts` | `/api/orgs/:orgId/subscription` | 订阅信息（只读） |
| `org/public-services.routes.ts` | `/`（root） + `/api/orgs/:orgId/service-intakes` | 公开服务列表 + 接入提交 |

---

## 6. 中间件管道

按 `server/src/middleware/` 真实文件：

| 中间件 | 职责 | 触发时机 |
|---|---|---|
| `cors` (Fastify plugin) | CORS allowlist | 全局 |
| `rate-limit` (Fastify plugin) | 限流（默认 100/min，从 system_config 读） | 全局 |
| `auth.ts` | JWT 验证，挂 `req.user` | 所有需要登录的 route |
| `org-context.ts` | 从 URL `/orgs/:orgId` 解析 orgId，验证 `req.user` 是该 org 成员，挂 `req.orgContext` | 所有 `/orgs/:orgId/*` route |
| `rbac.ts` | 基于 `org_members.role` (legacy) 检查 | 大部分写操作 |
| `authorize.ts` | 基于 V2 `RoleV2` + `access_profile` + Policy 检查 | 新接入的 route 优先用这个 |
| `data-scope.ts` | 数据范围过滤（按 `orgId` + `caseload`） | 所有读 PHI 的 route，**自觉调用** |
| `audit.ts` | 写 `audit_logs`（变更操作） | 写操作 route |
| `feature-flag.ts` | 功能开关（按 org / plan） | 灰度功能 |
| `library-ownership.ts` | 资产库行级 visibility 检查（personal / org / public） | 知识库 route |
| `reject-client.ts` | 拒绝 `principalClass='subject'` 误访问 staff route | staff-only route |
| `require-seat.ts` | 席位检查（按 plan 限制活跃用户数） | 创建用户 / 派单 |
| `system-admin.ts` | 仅 `users.is_system_admin=true` 通过 | `/api/admin/*` |

**已知工程债**：`data-scope` 是"自觉调用"模式 —— 新接口忘记加就漏数据。长期要么默认强制（白名单跳过）、要么 CI 静态检查扫所有 routes。

---

## 7. 数据模型 — 全 75 张表

按 schema.ts 中的 section 注释分组。每张表给一句话职责 + 关键字段。

### 7.1 平台层（5）
| 表 | 职责 | 关键字段 |
|---|---|---|
| `organizations` | 机构 | `plan` / `licenseKey` / `triageConfig`（jsonb）/ `dataRetentionPolicy`（jsonb） |
| `users` | 全局用户 | `isSystemAdmin` / `isGuardianAccount`（家长标记）|
| `password_reset_tokens` | 密码重置一次性 token | `tokenHash`（DB 只存 sha256）/ `expiresAt`（15min） |
| `org_members` | 机构成员 + 角色 | `role`（legacy）/ `roleV2` / `principalClass`（staff/subject/proxy）/ `accessProfile`（jsonb，单点权限补丁） |
| `client_profiles` | 来访者人口学资料 | `(orgId, userId)` UNIQUE / 紧急联系人 / 主诉 |

### 7.2 测评域（10）
| 表 | 职责 | 关键字段 |
|---|---|---|
| `scales` | 量表（题目集合 + 维度 + 计分规则） | `isPublic` / `allowedOrgIds` / `scoringMode` |
| `scale_dimensions` | 量表维度 | — |
| `dimension_rules` | 维度分段规则 | `minScore`/`maxScore`/`label`/`riskLevel` |
| `scale_items` | 题目 | `isReverseScored` / `options` |
| `assessments` | 测评模板 | `assessmentType`（screening/intake/survey/tracking）/ `screeningRules`（jsonb）/ `collectMode` |
| `assessment_scales` | M2M：测评 ↔ 量表 | composite PK |
| `assessment_results` | 测评结果 ⭐ | `aiInterpretation` / `clientVisible` / `recommendations` / **`aiProvenance`**（AI 水印） |
| `assessment_batches` | 批量施测 | `targetType` / `targetConfig` / `stats` |
| `assessment_reports` | 生成报告 | `reportType` / `aiNarrative` |
| `distributions` | 测评分发链接 | `mode` / `targets` / `schedule` |

### 7.3 咨询域（13）
| 表 | 职责 | 关键字段 |
|---|---|---|
| `care_episodes` | 个案核心实体 ⭐ | `currentRisk` / `interventionType` / `status` |
| `care_timeline` | 个案统一事件流 | `eventType` / `refId`（多态）/ `metadata` |
| `counselor_availability` | 咨询师可约时段 | `dayOfWeek` / `startTime`/`endTime` / `sessionType` |
| `appointments` | 预约 | `status` / `reminderSent24h`/`reminderSent1h` / `confirmToken` |
| `reminder_settings` | 提醒设置（per-org） | `channels`（email/sms）/ `remindBefore`（minutes 数组） |
| `note_templates` | 笔记模板（SOAP/DAP/BIRP/custom） | `format` / `fieldDefinitions` / `visibility` |
| `session_notes` | 会谈记录 ⭐ | `noteFormat` / `subjective`/`objective`/`assessment`/`plan` / `status`（draft/finalized/submitted_for_review/reviewed） / `supervisorAnnotation` |
| `note_attachments` | 笔记附件（文本/音频/图片/PDF） | `transcription` |
| `treatment_plans` | 治疗计划 | `approach`（CBT 等） / `goals`（jsonb） / `interventions`（jsonb） |
| `treatment_goal_library` | 治疗目标库 | `problemArea` / `objectivesTemplate` |
| `client_documents` | 文书（协议 / 合同 / 报告） | `recipientType`（client/guardian） / `signatureData` |
| `referrals` | 转介 ⭐ | `mode`（platform/external） / `status`（6 步状态机） / `dataPackageSpec` / `downloadToken` |
| `follow_up_plans` / `follow_up_reviews` | 随访计划与回访 | `nextDue` / `decision`（continue/escalate/close） |

### 7.4 AI 对话归档（1）
| 表 | 职责 | 关键字段 |
|---|---|---|
| `ai_conversations` | AI 对话归档 | `mode`（note/plan/simulate/supervise） / `sessionNoteId`（绑定会谈记录） |

### 7.5 团辅域（6）
| 表 | 职责 | 关键字段 |
|---|---|---|
| `group_schemes` | 团辅方案模板 | `theory` / `overallGoal` / `recruitmentAssessments` |
| `group_scheme_sessions` | 方案的会次大纲 | `phases`（结构化活动阶段） |
| `group_instances` | 团辅活动（实例） | `schemeId`（来源方案） / `assessmentConfig` |
| `group_enrollments` | 团辅报名 | `screeningResultId`（筛查结果绑定） |
| `group_session_records` | 团辅每次会次记录 | `sessionNumber` / `status` |
| `group_session_attendance` | 出勤 | `status`（present/absent/excused/late） |

### 7.6 课程域（10）
| 表 | 职责 | 关键字段 |
|---|---|---|
| `courses` | 课程模板 | `status`（draft/blueprint/content_authoring/published） / `creationMode`（ai_assisted/manual） / `blueprintData` |
| `course_chapters` | 章节 | `sessionGoal` / `coreConcepts` |
| `course_enrollments` | 报名 | `enrollmentSource`（assigned/class_batch/public_apply/self_enroll） / `approvalStatus` |
| `course_lesson_blocks` | 教师端教案（9 类 block） | `blockType` / `aiGenerated` |
| `course_template_tags` | 课程模板标签 | — |
| `course_content_blocks` | C 端可消费内容（video/audio/rich_text/pdf/quiz/reflection/worksheet/check_in）⭐ | `payload`（jsonb） |
| `group_session_blocks` | 团辅会次的 C 端内容（与 course_content_blocks 同形） | 同上 |
| `enrollment_block_responses` | 学员对内容块的响应（含安全 flag） | `enrollmentType`（course/group） / `safetyFlags` |
| `course_instances` | 课程实例 | `publishMode`（assign/class/public） |
| `course_feedback_forms` / `course_feedback_responses` | 课程反馈 | — |
| `course_homework_defs` / `course_homework_submissions` | 作业 | `reviewedBy` / `reviewComment` |
| `course_interaction_responses` | 课中互动响应（poll/emotion_checkin/anonymous_qa） | — |

### 7.7 合规与通知（5）
| 表 | 职责 | 关键字段 |
|---|---|---|
| `compliance_reviews` | AI 合规审核记录 | `reviewType` / `score` / `goldenThreadScore` |
| `notifications` | 站内通知 | `type` / `refType`/`refId`（多态） |
| `audit_logs` | 通用变更日志 | `action`/`resource`/`resourceId`/`changes`/`ipAddress` |
| `phi_access_logs` | PHI 访问日志 ⭐ | `dataClass` / `actorRoleSnapshot`（冻结当时角色） |
| `user_role_audit` | 角色变更专项审计 | `roleBefore`/`roleAfter`/`accessProfileBefore`/`After`/`actorRoleSnapshot` |
| `consent_templates` | 协议模板 | `consentType` / `visibility` / `allowedOrgIds` |
| `consent_records` | 协议签署记录 | `signerOnBehalfOf`（家长代签时记签字人 user.id） |

### 7.8 服务接入（1）
| 表 | 职责 | 关键字段 |
|---|---|---|
| `service_intakes` | 公开服务入口提交 | `serviceId` / `intakeSource` / `assignedCounselorId` |

### 7.9 权限与数据隔离（2）
| 表 | 职责 | 关键字段 |
|---|---|---|
| `client_assignments` | 来访者→咨询师派单 | `(orgId, clientId, counselorId)` UNIQUE / `isPrimary` |
| `client_access_grants` | 跨咨询师 break-glass 访问授权 | `reason`（必填）/ `expiresAt` / `revokedAt` |

### 7.10 EAP 企业版（5）
| 表 | 职责 | 关键字段 |
|---|---|---|
| `eap_partnerships` | 企业 ↔ 服务提供方机构合作 | `enterpriseOrgId` / `providerOrgId` / `seatAllocation` |
| `eap_counselor_assignments` | 企业 ↔ 咨询师指派 | — |
| `eap_employee_profiles` | 企业员工档案 | `entryMethod`（qr_code/link/sso/hr_import） / `isAnonymous` |
| `eap_usage_events` | 企业聚合使用事件（去标识） | `eventType` / `riskLevel` / `department` |
| `eap_crisis_alerts` | 企业版危机告警 | `crisisType`（self_harm/harm_others/abuse） / `notifiedContacts` |

### 7.11 学校版（2）
| 表 | 职责 | 关键字段 |
|---|---|---|
| `school_classes` | 班级 | `(orgId, grade, className)` UNIQUE / `homeroomTeacherId` |
| `school_student_profiles` | 学生档案 | `studentId` / `parentName`/`parentPhone`/`parentEmail` / `entryMethod` |

### 7.12 工作流规则引擎（3）⭐
| 表 | 职责 | 关键字段 |
|---|---|---|
| `workflow_rules` | 机构自动化规则 | `triggerEvent` / `conditions`（jsonb 数组） / `actions`（jsonb 数组） / `scopeAssessmentId` / `priority` / `source`（assessment_wizard/manual） |
| `workflow_executions` | 规则执行日志 | `conditionsMatched` / `actionsResult` / `status`（success/partial/failed/skipped） |
| `candidate_pool` ⭐⭐ | 待人决策候选池 | `kind`（episode_candidate/group_candidate/crisis_candidate/course_candidate） / `priority` / `sourceRuleId` / `status`（pending/accepted/dismissed/expired） / `targetGroupInstanceId`/`targetCourseInstanceId` |

### 7.13 AI 用量（1）
| 表 | 职责 | 关键字段 |
|---|---|---|
| `ai_call_logs` | 每次 AI 调用 token 用量 | `pipeline` / `model` / `promptTokens`/`completionTokens` |

### 7.14 危机处置（1）
| 表 | 职责 | 关键字段 |
|---|---|---|
| `crisis_cases` | 危机处置案件（1:1 绑定 careEpisode） | `stage`（open/pending_sign_off/closed/reopened） / `checklist`（5 步状态 jsonb） / `signedOffBy`（督导） |

### 7.15 家长自助绑定（2）
| 表 | 职责 | 关键字段 |
|---|---|---|
| `class_parent_invite_tokens` | 班级家长邀请二维码 token | `(classId, token)` / `expiresAt` |
| `client_relationships` | 家长 ↔ 来访者关系 | `holderUserId`（家长） / `relatedClientUserId`（孩子） / `relation`（father/mother/guardian/other） |

### 7.16 系统配置（1）
| 表 | 职责 | 关键字段 |
|---|---|---|
| `system_config` | 平台级配置（rate-limit / 文件大小等） | `(category, key)` UNIQUE |

---

## 8. 关键关系图（ERD 简化）

```
                        organizations
                             │
                             │ 1:N
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         org_members    care_episodes   workflow_rules
              │ N:1           │ 1:N           │ 1:N
              ▼               ▼               ▼
            users        care_timeline   workflow_executions
              ▲          ┌──┼──┬──┬──┐         │
              │ 1:1      │  │  │  │  │         │ 触发产生
              ▼          ▼  ▼  ▼  ▼  ▼         ▼
        client_profiles  ses note  apt  rfr  fup     candidate_pool
                         │ │     │   │    │           │
                         │ │     │   │    │           │ accepted →
                         ▼ ▼     ▼   ▼    ▼           ▼
                   note_attach            launch.service.ts
                                          ┌──┬──┬──┬──┬──┐
                                          ▼  ▼  ▼  ▼  ▼  ▼
                                        crs grp epi ast cnt rfr
                                        实例化 6 类服务
```

---

## 9. 角色与权限模型 V2

### 9.1 双层角色

- **Legacy `org_members.role`**: `org_admin | counselor | client`（保留兼容）
- **V2 `org_members.role_v2`**: per-orgType 字典，DB trigger 强约束

### 9.2 OrgType × Role 矩阵

| OrgType | 合法角色集 |
|---|---|
| `school`（学校） | school_admin / school_leader / psychologist / homeroom_teacher / student / parent |
| `counseling`（咨询中心） | clinic_admin / supervisor / counselor / client |
| `enterprise`（企业 EAP） | hr_admin / eap_consultant / employee |
| `solo`（个体咨询师） | owner / client |
| `hospital`（医疗，占位未实装） | hospital_admin / attending / resident / nurse / patient / family |

### 9.3 PrincipalClass

决定登录入口和 Portal tab 集：

| Principal | 角色举例 | 入口 |
|---|---|---|
| `staff` | 所有管理 / 执业岗位 | 主 App |
| `subject` | client / student / employee / patient | Portal 自视角 |
| `proxy` | parent / family | Portal 监护视角 |

### 9.4 access_profile（单点权限补丁）

`org_members.access_profile` jsonb：`{ dataClasses: DataClass[], extraScopes: string[], grantedAt, grantedBy, reason }`
是 Role 默认策略的覆盖层，UI 接入待补。

### 9.5 数据范围 (data-scope)

`middleware/data-scope.ts` 给 SQL where 子句注入：
- 必有 `org_id = req.orgContext.orgId`
- counselor：还要叠加 `client_id IN (caseload)` 或 `counselor_id = req.user.id`
- supervisor：本机构所有 PHI 可看（但每次访问写 `phi_access_logs`）
- client：仅 `user_id = req.user.id`

---

## 10. 跨切关注点

### 10.1 AI 合规水印（PR #1 落地）

```
AI Pipeline 调用
   │
   ▼
{ result, provenance: { aiGenerated, aiModel, aiPipeline,
                         aiConfidence, aiGeneratedAt } }
   │
   ▼ 写库
DB.assessment_results.ai_provenance jsonb (nullable)
   │
   ▼ 渲染
<AIBadge provenance={...}/>  紫色 / aiReviewedBy 在场则绿色
```

**接入面**：当前仅 `assessment_results.ai_provenance` + `TriageDetailPanel` 一处。
**未接入**：`assessmentResults.aiInterpretation` 列、`aiConversations`、`session_notes`（AI SOAP 生成）、`treatment_plans`（AI 计划）等 ~25 个 AI 输出 surface。

### 10.2 PHI 访问留痕

每次咨询师 / 督导 / 管理员访问含 PHI 的资源（session_notes / assessment_results / care_episodes / client_documents），后端写一行 `phi_access_logs`，含 `dataClass` + `actorRoleSnapshot`。

**前端可视化（PHI 访问看板）尚未做**——表写得齐，UI 缺。

### 10.3 通用审计（audit_logs）

写操作（create / update / delete）走 `middleware/audit.ts`，写 `audit_logs.changes` jsonb diff。

### 10.4 角色变更审计（user_role_audit）

`role_v2` / `access_profile` / `principal_class` 三个字段任一变更都写一行，含 before/after 快照 + actor 当时的角色。

### 10.5 BullMQ 后台任务

`server.ts` 启动时拉起 worker。当前 jobs：
- `appointment-reminder`：24h / 1h 前提醒（已接 Nodemailer）
- `follow-up-scheduler`：**待补**
- `audit-rollup`：**待补**

### 10.6 Rate limit

`@fastify/rate-limit` plugin。limit 从 `system_config.limits.rateLimitMax` 读，默认 100/min。

---

## 11. AI 子系统（33 pipelines）

`server/src/modules/ai/pipelines/`：

| Pipeline | 用途 | 是否在主链路 |
|---|---|---|
| `triage.ts` | 测评结果 → 风险评级 + 推荐动作 ⭐ | 是 |
| `interpretation.ts` | 测评 AI 解读 | 是 |
| `risk-detection.ts` | 风险信号检测 | 是 |
| `soap-analysis.ts` | SOAP 笔记结构化 | 是 |
| `supervision.ts` | 督导建议 | 是 |
| `treatment-plan.ts` | 治疗计划生成 | — |
| `compliance-review.ts` | 合规审核 | — |
| `recommendation.ts` | 推荐 | — |
| `report-narrative.ts` / `progress-report.ts` / `case-progress-report.ts` | 报告生成 | — |
| `referral-summary.ts` | 转介摘要 | — |
| `client-summary.ts` | 来访者摘要 | — |
| `note-guidance-chat.ts` | 笔记辅助对话 | — |
| `session-material.ts` | 会谈材料生成 | — |
| `simulated-client.ts` | AI 模拟来访者（咨询师练习） | — |
| `course-authoring.ts` / `extract-course.ts` / `create-course-chat.ts` | 课程生成 | — |
| `generate-scheme.ts` / `extract-scheme.ts` / `create-scheme-chat.ts` | 团辅方案生成 | — |
| `extract-scale.ts` / `create-scale-chat.ts` | 量表生成 | — |
| `extract-goal.ts` / `create-goal-chat.ts` | 目标库生成 | — |
| `extract-agreement.ts` / `create-agreement-chat.ts` | 协议生成 | — |
| `extract-note-template.ts` / `create-note-template-chat.ts` | 笔记模板生成 | — |
| `create-screening-rules.ts` | 筛查规则生成 | — |
| `poster-copy.ts` | 海报文案 | — |

每次调用经 `usage-tracker.ts` 写 `ai_call_logs`。Provider 抽象在 `providers/openai-compatible.ts`。

---

## 12. 关键流程（端到端）

### 12.1 主链路：测评 → 候选 → 一键启动

```
┌─────────────────────────────┐
│ 1. 来访者通过 distribution    │
│    链接填测评                  │
│    POST /api/public/         │
│    assessments/:id/submit     │
└─────────────────────────────┘
              │
              ▼
┌─────────────────────────────┐
│ 2. assessment_results        │
│    INSERT + 计算 totalScore /  │
│    dimensionScores / riskLevel │
└─────────────────────────────┘
              │
              ▼
┌─────────────────────────────┐
│ 3. triage-automation.service  │
│    AI pipeline triage 调用     │
│    → recommendations[]         │
│    → 写 ai_provenance          │
└─────────────────────────────┘
              │
              ▼
┌─────────────────────────────┐
│ 4. rule-engine.runRulesForEvent│
│    event='assessment_result.   │
│    created'                    │
│    匹配 workflow_rules         │
│    → for each action：         │
│      - assign_course: 自动      │
│      - 其他: 写 candidate_pool  │
└─────────────────────────────┘
              │
              ▼
┌─────────────────────────────┐
│ 5. 咨询师在 ResearchTriagePage │
│    三栏看到 candidate          │
│    GET /api/orgs/:orgId/triage │
└─────────────────────────────┘
              │
              ▼
┌─────────────────────────────┐
│ 6. 咨询师选课程 / 建团辅 / 接受   │
│    POST .../launch             │
│    actionType+payload          │
└─────────────────────────────┘
              │
              ▼
┌─────────────────────────────┐
│ 7. launch.service.launch()   │
│    dispatch 到对应 service：    │
│    courseInstance.create() etc │
│    返回 { kind, instanceId,    │
│         summary }              │
└─────────────────────────────┘
              │
              ▼
┌─────────────────────────────┐
│ 8. candidate_pool 行           │
│    UPDATE status='accepted'    │
│       resolvedRefType=...      │
│       resolvedRefId=...        │
│    +写 care_timeline          │
└─────────────────────────────┘
```

**e2e regression**：`e2e/smoke/triage-dispatch-counselor.spec.ts` 串了 dataScopeGuard / lazyCreate / launch 4 段，回归任何一环就红。

### 12.2 危机处置工作流（Phase 13）

```
crisis_candidate (candidate_pool)
   │ 咨询师接手
   ▼
原子创建：
  - careEpisode (interventionType='crisis', currentRisk='level_4')
  - crisis_cases (stage='open', checklist={5 步})
   │ 咨询师走 5 步清单
   │  ① reinterview  ② parentContact  ③ documents
   │  ④ referral     ⑤ followUp
   │ 每步进度同步写 care_timeline
   ▼
crisis_cases.stage='pending_sign_off'
   │ 督导审核
   ├── 通过 → stage='closed' + careEpisode.status='closed'
   └── 退回 → stage='reopened'（保留审计留痕）
```

### 12.3 家长自助绑定（Phase 14）

```
老师在班级 UI 生成 token
   │ POST .../parent-invite-tokens
   ▼
class_parent_invite_tokens INSERT
   │ token 嵌入二维码贴家长群
   ▼
家长扫码 → 公开页 /api/public/parent-bind/:token
   │ 选择 class 内的孩子 + 填亲属关系
   ▼
原子创建：
  - users (isGuardianAccount=true)
  - org_members (roleV2='parent', principalClass='proxy')
  - client_relationships (holderUserId=家长, relatedClientUserId=孩子)
   │ 登录家长 Portal
   ▼
GET /api/orgs/:orgId/client/children
   │ 看到自己绑定的孩子（dashboard / appointments / documents 等只读视图）
```

### 12.4 转介双向流（Phase 9δ）

```
referrals.status 状态机：
   pending → consented → accepted → completed
                       ↓ rejected
   pending → cancelled

mode=platform：接收方是 psynote 用户/机构（toCounselorId/toOrgId）
mode=external：生成 PDF + 一次性下载 token（downloadToken）

Public download: GET /api/public/referrals/:token
   - token 校验 + 过期检查
   - 返回 PDF（包 dataPackageSpec 选中的 records）
```

---

## 13. 部署拓扑

### 13.1 当前实现（Dockerfile + docker-compose.yml + Caddyfile）

```
┌─────────────────────────────────────────────────────────┐
│  Caddy 反向代理（自动 HTTPS via Let's Encrypt）           │
│   :80 / :443  →  app:4000                                │
└─────────────────────────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐
   │ app      │  │ postgres │  │  redis   │
   │ Fastify  │  │  :5432   │  │  :6379   │
   │ +Vite    │  │ volume   │  │ volume   │
   │ static   │  │ persist  │  │ persist  │
   └──────────┘  └──────────┘  └──────────┘
```

### 13.2 推荐生产拓扑（5-7 人小机构）

参考 `docs/deployment/`。要点：
- 阿里云 / 腾讯云 ECS 2c4g（中国大陆）
- DB 整盘加密 + 每日快照 + 周度 off-site 备份到 OSS
- ICP 备案
- Sentry 错误监控
- AI 调用走境内可达的 OpenAI compatible（如 deepseek / 通义 / 智谱兼容层）

### 13.3 不建议的部署方式

- ❌ 本地个人电脑 + 内网穿透（PHI 合规暴露）
- ❌ 境外 PaaS（Vercel / Render / Fly.io）（数据出境）
- ❌ 不加密的 DB（合规）

---

## 14. 已知工程债 / Gap

按 `memory/project_gap_analysis_2026Q2.md` 的优先级：

### 🔴 阻塞主链路真正闭环
1. **rule editor UI** —— 后端齐全，前端 0
2. **AI 水印铺开到 25+ pipelines** —— 仅 `assessment_results.ai_provenance` 一处
3. **autoTriageAndNotify 接 BullMQ** —— 当前 fire-and-forget 没重试 / 死信

### 🟠 阻塞机构化扩展
4. **组织树**（`organizations.parentOrgId` / `partnerType`）—— 当前扁平
5. **PHI 访问看板 UI** —— 表齐 UI 缺
6. **随访自动化 BullMQ job**

### 🟡 阻塞市场扩展
7. **Portal 自助化**（在线签协议 / 自助预约 / 课程阅读器深化 / 作业提交 / 团辅签到）
8. **资产库统一管道**（创建 / 导入 / 导出 / 版本 / 跨机构共享）
9. **角色权限模板可配置化**

### 工程层
- `data-scope` 中间件"自觉调用"模式 —— 长期需默认强制 / CI 静态检查
- monorepo workspace 包 main 指向 dist 是常见陷阱（详见 `engineering_lesson_ci_e2e_build_shared_2026Q2`）

---

## 15. 参考与读源约定

### 单一事实源
- **DB schema**: `server/src/db/schema.ts`
- **路由总览**: `server/src/app.ts`
- **角色 V2**: `packages/shared/src/auth/roles.ts`
- **enums**: `packages/shared/src/types/enums.ts`
- **launch 6 actionType**: `server/src/modules/delivery/launch.service.ts`
- **rule-engine 触发与 candidate_pool**: `server/src/modules/workflow/rule-engine.service.ts`
- **AI pipelines**: `server/src/modules/ai/pipelines/*.ts`

### 阅读建议
1. 想理解"产品做什么" → 读 §0 + §3 + §12
2. 想理解"代码怎么组织" → 读 §2 + §4 + §5
3. 想加新功能 → 先读 `app.ts` 看 route 注册位置 + `schema.ts` 找域 + `launch.service` 看是否能复用
4. 想理解角色权限 → 读 §9 + `docs/architecture/role-authorization.md`
5. 想部署 → 读 §13 + `docs/deployment/`

### 验证日期
本文档基于 2026-04-30 PR #1 merge 后代码。**任何 schema / service 变更后请同步更新此文档**——否则参照 §15 的源文件路径直接读代码。
