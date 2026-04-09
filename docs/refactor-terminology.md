# Psynote 重构术语字典

> 本文件是 psynote 全平台重构（v2 路线图）的术语规约，用于统一 UI 文案、共享类型和团队沟通。
> 详细路线图见：`C:\Users\psyli\.claude\plans\zazzy-fluttering-duckling.md`

## 1. 改动原则

1. **UI 文案 = 新术语**：所有用户可见的中文 label、按钮文字、页面标题、tab 名称必须使用本文件定义的统一术语。
2. **代码标识符 = 保留**：现有的 TypeScript 类型名、文件名、目录名、DB 表名继续使用旧标识符，不做大规模 rename，降低破坏面。
3. **新建代码 = 用新术语**：Phase 0 之后新增的文件、类型、变量优先使用统一术语（如 `ServiceInstance`、`Participant`），并在代码注释里指出它对应哪个底层实体。
4. **聚合而非迁移**：四种交付模块的底层数据表（`care_episodes` / `group_instances` / `course_instances` / `assessments`）保持原样，通过前端 mapper 和可选的服务端 UNION 在上层做聚合视图。

## 2. 核心术语映射

| 目标术语（UI 中文） | 英文标识符（新代码） | 旧代码标识符（保留） | 涉及模块 |
|---|---|---|---|
| **服务（Service）** | `ServiceInstance` | `Episode` / `GroupInstance` / `CourseInstance` / `Assessment` | 全部交付层 |
| **服务种类（Service Kind）** | `ServiceKind` | — | 跨模块筛选 |
| **参与者（Participant）** | `Participant` | `client` / `member` / `enrolled user` / `respondent` | 全部交付层 |
| **事件（Session）** | — | `SessionNote` / `GroupSession` / `CourseLesson` / `AssessmentSubmission` | 详情页时间线 |
| **记录（Record）** | — | `SessionNote.body` / `GroupSessionNotes` / `CourseFeedback` / `AssessmentReport` | 详情页记录 tab |
| **资产（Asset）** | — | `Scheme` / `Course` / `Scale` / `Agreement` / `NoteTemplate` | 知识库（已统一） |

## 3. 状态术语

跨模块的统一状态枚举 `ServiceStatus`：

| 中文 | 标识符 | 来源映射 |
|---|---|---|
| 草稿 | `draft` | EpisodeStatus / GroupStatus / CourseInstanceStatus / AssessmentStatus 中的 `draft` |
| 活跃 | `active` | EpisodeStatus / CourseInstanceStatus / AssessmentStatus 中的 `active` |
| 招募中 | `recruiting` | GroupStatus.recruiting |
| 进行中 | `ongoing` | GroupStatus.ongoing / GroupStatus.full |
| 已完成 | `completed` | GroupStatus.ended |
| 已结束 | `closed` | EpisodeStatus.closed / CourseInstanceStatus.closed |
| 已暂停 | `paused` | EpisodeStatus.paused |
| 已取消 | `cancelled` | — |
| 已归档 | `archived` | EpisodeStatus.archived / CourseInstanceStatus.archived / AssessmentStatus.archived |

mapper 实现见 `client/src/api/service-instance-mappers.ts`（Phase 5 创建）。

## 4. 参与者角色术语

| UI 中文 | `ParticipantRole` | 出现在 |
|---|---|---|
| 来访者 | `client` | counseling |
| 成员 | `member` | group |
| 学员 | `student` | course |
| 受测者 | `respondent` | assessment |

## 5. 详情页 Tab 术语

四个交付模块的详情页统一使用以下 5 个标准 tab，各模块通过 `visibleTabs` 隐藏不需要的：

| Tab 中文 | 标识符 | counseling | group | course | assessment |
|---|---|---|---|---|---|
| 总览 | `overview` | ✅ | ✅ | ✅ | ✅ |
| 参与者 | `participants` | ✅ | ✅ | ✅ | ❌ |
| 时间线 | `timeline` | ✅ | ✅ | ✅ | ✅ |
| 记录 | `records` | ✅ | ✅ | ✅ | ✅ |
| 资产 | `assets` | ✅ | ✅ | ✅ | ❌ |

注意：counseling 因保留 3 列 workspace 形式，详情页通过 `ServiceDetailLayout variant="workspace"` 渲染，tab bar 不出现，但术语依然适用于其他视图引用。

## 6. 首页三段式术语

新版首页 `DashboardHome.tsx` 三段式布局术语：

| 段名 | 含义 | 包含组件 |
|---|---|---|
| 看板 · 未来 | 数量瓦片，反映待办负载 | `<DashboardCountGrid />` |
| 操作台 · 现在 | 当下需要操作的事项 | `<Workstation />`（预约管理 + 建案弹窗） |
| 档案库 · 过去 | 历史轨迹与跟进提醒 | `<RecentInteractions />` + `<FollowUpAlerts />` |

## 7. 模块入口术语

侧边栏导航项：

| 旧导航 | 新导航 |
|---|---|
| 首页 | 首页 |
| 知识库 | 知识库 |
| 测评管理 / 个体咨询 / 团辅中心 / 课程中心（4 项） | **交付中心**（1 项，含 type 筛选 tab） |
| 成员管理 | 成员管理 |

交付中心 `/delivery` 内的 type 筛选 tab：`全部 | 个案 | 团辅 | 课程 | 测评 | 对象档案`。

## 8. SaaS Tier 术语

`organizations.plan` 字段的语义映射（Phase 7 激活）：

| DB 值 | OrgTier | 中文 |
|---|---|---|
| `free` | `solo` | 个人版 |
| `pro` | `team` | 团队版 |
| `enterprise` | `enterprise` | 企业版 |
| —（保留） | `platform` | 平台版 |

## 9. 修改记录

| 日期 | 变更 | 原因 |
|---|---|---|
| 2026-04-09 | 首版 | Phase 0 引入 |
