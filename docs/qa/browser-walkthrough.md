# Psynote Alpha — 浏览器全量按钮测试

**当前 URL**: https://annex-spotlight-pleasant-hunt.trycloudflare.com  
**登录账号**: `a@test.psynote.cn` / `test123456` (系统管理员 A)  
**辅助账号**: `b@test.psynote.cn` (空白用户), `c@test.psynote.cn` (空白用户)  
**最后更新**: 2026-04-27 (执行中)  
**对应 plan**: `C:\Users\psyli\.claude\plans\l1-l4-luminous-sunset.md` § Phase F

## 状态图例
- `[ ]` 未测
- `[x]` 通过
- `[!]` 失败 (见 BUG-NNN)
- `[~]` 阻塞 (前置条件缺失)
- `[-]` 跳过 (附理由)

---

# Tier 1 — 关键路径 + 回归热点

预估按钮数: ~80, 预估 tool 调用: ~230

## 1.1 /login —— 登录页 (`features/auth/pages/LoginPage.tsx`)

| # | 按钮/控件 | 操作 | 期望 | 状态 | Bug |
|---|----------|------|------|------|-----|
| 1 | 邮箱输入框 | 输入 a@test.psynote.cn | 字段更新 | [ ] | |
| 2 | 密码输入框 | 输入 test123456 | 字段更新 (masked) | [ ] | |
| 3 | "忘记密码?" 链接 | 点击 | 跳转 /forgot-password | [ ] | |
| 4 | 同意条款 checkbox | 勾选 | 提交按钮启用 | [ ] | |
| 5 | "立即登录" 按钮 | 提交合法凭证 | 跳转 /admin/dashboard, localStorage 写入 token | [ ] | |
| 6 | "用户协议" 链接 | 点击 | 新 tab 打开 /legal/terms (非 404) | [ ] | |
| 7 | "隐私政策" 链接 | 点击 | 新 tab 打开 /legal/privacy (非 404) | [ ] | |
| 8 | 错误密码 | 提交 wrong password | 显示 "邮箱或密码错误" toast | [ ] | |
| 9 | 不存在邮箱 | 提交 fake@x.com | 显示一致错误信息 (防枚举) | [ ] | |

## 1.2 /forgot-password (`features/auth/pages/ForgotPasswordPage.tsx`)

| # | 按钮/控件 | 操作 | 期望 | 状态 | Bug |
|---|----------|------|------|------|-----|
| 1 | 邮箱输入 | 输入合法邮箱 | 字段更新 | [ ] | |
| 2 | "发送重置链接" 按钮 | 提交 | 200 + "请检查邮箱" 提示 | [ ] | |
| 3 | 提交不存在邮箱 | 提交 nobody@x.com | 仍 200 + 同样提示 (防枚举) | [ ] | |
| 4 | "返回登录" 链接 | 点击 | 跳 /login | [ ] | |

## 1.3 /admin/dashboard (`features/admin/pages/AdminHome.tsx`)

| # | 按钮/控件 | 操作 | 期望 | 状态 | Bug |
|---|----------|------|------|------|-----|
| 1 | 侧栏 "首页" | 点击 | 高亮当前页 | [ ] | |
| 2 | 侧栏 "租户管理" | 点击 | 跳 /admin/tenants | [ ] | |
| 3 | 侧栏 "用户管理" | 点击 | 跳 /admin/users | [ ] | |
| 4 | 侧栏 "知识库" | 点击 | 跳 /admin/library/scales | [ ] | |
| 5 | 侧栏 "系统设置" | 点击 | 跳 /admin/settings | [ ] | |
| 6 | "退出" / 用户头像菜单 | 点击 | 清 localStorage + 跳 /login | [ ] | |
| 7 | 仪表盘 KPI 卡片 (若有) | 点击 | 数据加载, 无 console error | [ ] | |

## 1.4 /admin/tenants (`features/admin/pages/TenantList.tsx`)

| # | 按钮/控件 | 操作 | 期望 | 状态 | Bug |
|---|----------|------|------|------|-----|
| 1 | 搜索框 | 输入 "心启星辰" | 列表过滤 | [ ] | |
| 2 | 组织类型 filter | 选 counseling | 过滤 | [ ] | |
| 3 | 套餐 filter | 选 growth | 过滤 | [ ] | |
| 4 | 许可证状态 filter | 选 active | 过滤 | [ ] | |
| 5 | "新建租户" 按钮 | 点击 | 跳 /admin/tenants/new | [ ] | |
| 6 | 租户行点击 | 点击 | 跳 /admin/tenants/:id | [ ] | |
| 7 | 编辑图标 | 点击 | 弹出编辑 modal | [ ] | |
| 8 | 删除图标 | 点击 | 确认对话框 → DELETE | [ ] | |

## 1.5 /admin/tenants/new (`features/admin/pages/TenantWizard.tsx`) — 6 步向导

| # | 按钮/控件 | 操作 | 期望 | 状态 | Bug |
|---|----------|------|------|------|-----|
| 1 | "返回租户列表" | 点击 | 跳 /admin/tenants | [ ] | |
| 2 | Step 1 组织类型 - counseling | 点击卡片 | 高亮选中 | [ ] | |
| 3 | Step 1 组织类型 - school | 点击卡片 | 高亮选中 | [ ] | |
| 4 | Step 1 "下一步" 空名 | 不填名称点 | inline 错误 | [ ] | |
| 5 | Step 1 "下一步" 合法 | 填好后点 | 进 step 2 | [ ] | |
| 6 | Step 2 套餐 - starter | 点击 | 选中 | [ ] | |
| 7 | Step 2 套餐 - growth | 点击 | 选中 | [ ] | |
| 8 | Step 2 套餐 - flagship | 点击 | 选中 | [ ] | |
| 9 | Step 2 maxSeats 输入 | 输入 5 | 字段更新 | [ ] | |
| 10 | Step 3 admin "新建用户" tab | 点击 | 切换 mode | [ ] | |
| 11 | Step 3 admin "已有用户" tab | 点击 | 切换 mode | [ ] | |
| 12 | Step 3 用 b@test.psynote.cn (已存在) | 提交合法表单 | **复用成功** (回归 ea6a1dd) | [ ] | |
| 13 | "上一步" | 点击 | 退回上一步 | [ ] | |
| 14 | 进度点击已完成 step | 点 step1 圆圈 | 跳回 step1 | [ ] | |
| 15 | "确认创建" | 点击 | POST /admin/tenants → 201 → 跳 /admin/tenants/:newId | [ ] | |

## 1.6 /admin/tenants/:id (`features/admin/pages/TenantDetail.tsx`)

| # | 按钮/控件 | 操作 | 期望 | 状态 | Bug |
|---|----------|------|------|------|-----|
| 1 | "返回租户列表" | 点击 | 跳 /admin/tenants | [ ] | |
| 2 | Tab "基本信息" | 点击 | 加载 metadata | [ ] | |
| 3 | Tab "成员 (N)" | 点击 | 加载成员列表 | [ ] | |
| 4 | "修改" 基本信息 | 点击 | 字段进编辑态 | [ ] | |
| 5 | "保存" 基本信息 | PATCH | 200 + 退出编辑 | [ ] | |
| 6 | "取消" 基本信息 | 点击 | 字段还原 | [ ] | |
| 7 | "签发许可证" (无 license) | 点击 → 选 growth/12月 → 签发 | **POST /admin/licenses/issue 200** (回归 7b2eb05 PEM 修复) | [ ] | |
| 8 | "续期 12 个月" | 点击 | POST /renew → 200 | [ ] | |
| 9 | "撤销许可证" | 点击 | 确认 → DELETE → license 变 none | [ ] | |
| 10 | "添加成员" 用 b@ (已存在) | 提交 | **201 复用** (回归 ea6a1dd) | [ ] | |
| 11 | "添加成员" 用全新邮箱 | 提交 | 201 新建 user | [ ] | |
| 12 | 成员角色 dropdown | 改 counselor → org_admin | PATCH 200, 行更新 | [ ] | |
| 13 | 成员删除图标 | 点击 → 确认 | DELETE 200, 行消失 | [ ] | |
| 14 | "修改 AI 服务" → 保存 | 改 model → PATCH | 200 + toast | [ ] | |
| 15 | "修改邮件配置" → 保存 | 改 SMTP host → PATCH | 200 + toast | [ ] | |

## 1.7-1.12 /admin/library/{scales,goals,agreements,schemes,courses,templates} — 6 个 tab 浅 copy 验证

每个 tab 的标准 5 行（共 30 行 × 6 = 30 总按钮，每个 tab 5 个）：

### 1.7 /admin/library/scales (`features/assessment/pages/ScaleLibrary.tsx`)
| # | 按钮 | 操作 | 期望 | 状态 | Bug |
|---|------|------|------|------|-----|
| 1 | tab 切换 → "测评量表" | 点击 | 列表加载 | [ ] | |
| 2 | "AI 生成" | 点击 | 进 AIScaleCreator (max-w-4xl 居中) | [ ] | |
| 3 | "文本导入" | 点击 | 进 ScaleImporter | [ ] | |
| 4 | 量表行 - 编辑图标 | 点击 | 进 ScaleDetail editing=true | [ ] | |
| 5 | 量表行 - 删除 | 点击 → 确认 | DELETE 204, 行消失 | [ ] | |
| 6 | **创建新量表 → 编辑 dim → 保存 → 重开** | 完整流程 | **dim/items/rules 完整保留** (回归 ef181e0) | [ ] | |

### 1.8 /admin/library/goals (`features/knowledge/pages/GoalLibrary.tsx`)
| # | 按钮 | 操作 | 期望 | 状态 | Bug |
|---|------|------|------|------|-----|
| 1 | tab 切换 → "干预目标" | 点击 | 列表加载 | [ ] | |
| 2 | "AI 生成" | 点击 | 进 AI 创建器 (max-w-4xl) | [ ] | |
| 3 | "文本导入" | 点击 | 进 importer | [ ] | |
| 4 | 编辑图标 | 点击 | 进详情 editing=true | [ ] | |
| 5 | 删除 | 点击 → 确认 | DELETE 204 | [ ] | |
| 6 | **创建 → 加 objectives → 保存 → 重开** | 完整 | **objectives 不丢失** (浅 copy 嫌疑) | [ ] | |

### 1.9 /admin/library/agreements (`features/knowledge/pages/AgreementLibrary.tsx`)
| # | 按钮 | 操作 | 期望 | 状态 | Bug |
|---|------|------|------|------|-----|
| 1 | tab 切换 | 点击 | 列表加载 | [ ] | |
| 2 | "AI 生成" | 点击 | 进 AI 创建器 (max-w-4xl) | [ ] | |
| 3 | "文本导入" | 点击 | 进 importer | [ ] | |
| 4 | 编辑图标 | 点击 | 进详情 editing | [ ] | |
| 5 | 删除 | 点击 → 确认 | DELETE | [ ] | |
| 6 | **创建 → 加 sections → 保存 → 重开** | 完整 | **sections/content 不丢失** (浅 copy 嫌疑) | [ ] | |

### 1.10 /admin/library/schemes (`features/knowledge/pages/SchemeLibrary.tsx`)
| # | 按钮 | 操作 | 期望 | 状态 | Bug |
|---|------|------|------|------|-----|
| 1 | tab 切换 | 点击 | 列表加载 | [ ] | |
| 2 | "AI 生成" | 点击 | 进 AI 创建器 | [ ] | |
| 3 | "文本导入" | 点击 | 进 importer | [ ] | |
| 4 | 编辑图标 | 点击 | 进详情 | [ ] | |
| 5 | 删除 | 点击 → 确认 | DELETE | [ ] | |
| 6 | **创建 → 加 sessions → 保存 → 重开** | 完整 | **sessions 列表不丢失** (浅 copy 嫌疑) | [ ] | |

### 1.11 /admin/library/courses (`features/knowledge/pages/PlaceholderTabs.tsx`)
| # | 按钮 | 操作 | 期望 | 状态 | Bug |
|---|------|------|------|------|-----|
| 1 | tab 切换 | 点击 | 加载 | [ ] | |
| 2 | "AI 生成" / 创建入口 | 点击 | 进创建流 | [ ] | |
| 3 | 编辑/查看 | 点击 | 进详情 | [ ] | |
| 4 | 删除 | 点击 | DELETE | [ ] | |
| 5 | **创建 → 加 lessons → 保存 → 重开** | 完整 | **lessons 不丢失** (浅 copy 嫌疑) | [ ] | |

### 1.12 /admin/library/templates (`features/knowledge/pages/NoteTemplateLibrary.tsx`)
| # | 按钮 | 操作 | 期望 | 状态 | Bug |
|---|------|------|------|------|-----|
| 1 | tab 切换 | 点击 | 加载 | [ ] | |
| 2 | "AI 生成" | 点击 | 进 AI 创建器 | [ ] | |
| 3 | "文本导入" | 点击 | 进 importer | [ ] | |
| 4 | 编辑 | 点击 | 进详情 | [ ] | |
| 5 | 删除 | 点击 | DELETE | [ ] | |
| 6 | **创建 → 加 fieldDefinitions → 保存 → 重开** | 完整 | **fieldDefinitions 不丢失** (浅 copy 嫌疑) | [ ] | |

## 1.13 /knowledge/scales 详情页布局 (`features/assessment/components/ScaleDetail.tsx`) — 响应式回归

| # | 按钮/控件 | 操作 | 期望 | 状态 | Bug |
|---|----------|------|------|------|-----|
| 1 | 子 tab "总览" | 点击 | OverviewTab 加载 | [ ] | |
| 2 | 子 tab "维度" | 点击 | DimensionsTab 加载 | [ ] | |
| 3 | 子 tab "题目" | 点击 | ItemsTab 加载 | [ ] | |
| 4 | 子 tab "选项配置" | 点击 | OptionsTab 加载 | [ ] | |
| 5 | "返回" 按钮 (TopBar) | 点击 | 回 list (回归 a0fd40b 移到 TopBar) | [ ] | |
| 6 | "编辑" 按钮 | 点击 | 进 editing 态 | [ ] | |
| 7 | "保存" / "取消" | 点击 | 退出 editing | [ ] | |
| 8 | "AI 助手" 折叠/展开 | 点击图标 | 面板隐藏/显示, localStorage 持久化 | [ ] | |
| 9 | TopBar 在 1280px 不溢出 | 缩窄到 1280px | 按钮文案在 lg 以下变图标 (回归 a0fd40b) | [ ] | |

---

# Tier 2 — 主 CRUD + 设置 + AI 生成流

预估按钮数: ~50, AI 生成流 6 类 (~50 calls), 总 tool 调用 ~300

## 2.1 / (RoleBasedHome → AdminHome 或 OrgAdminDashboard)
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | KPI 卡 - 本月新增来访者 | 点击 | 跳 delivery 过滤 | [ ] |
| 2 | KPI 卡 - 本月个咨 | 点击 | 跳 delivery counseling | [ ] |
| 3 | KPI 卡 - 进行中团辅 | 点击 | 跳 delivery group | [ ] |
| 4 | KPI 卡 - 进行中课程 | 点击 | 跳 delivery course | [ ] |
| 5 | KPI 卡 - 本月测评 | 点击 | 跳 delivery assessment | [ ] |
| 6 | 通知 item | 点击 | 标已读/跳详情 | [ ] |

## 2.2 /delivery
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | type filter "全部" | 点击 | 加载 all aggregate | [ ] |
| 2 | type filter "个咨" | 点击 | CaseWorkbench | [ ] |
| 3 | type filter "团辅" | 点击 | GroupCenter | [ ] |
| 4 | type filter "课程" | 点击 | CourseManagement | [ ] |
| 5 | type filter "测评" | 点击 | AssessmentManagement | [ ] |
| 6 | "人员档案" tab | 点击 | PeopleList | [ ] |
| 7 | 搜索框 | 输入 | 过滤 | [ ] |
| 8 | 卡片点击 | 点击 | 跳 detail | [ ] |
| 9 | "新建个案" | 点击 | 跳 /episodes/new | [ ] |
| 10 | "新建团辅" | 点击 | wizard | [ ] |
| 11 | "新建课程" | 点击 | wizard | [ ] |
| 12 | "新建测评" | 点击 | wizard | [ ] |

## 2.3 /episodes/new (CreateEpisodeWizard 5 step)
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1-3 | Step 1 SelectClient | 选/搜/取消 | client 选定 | [ ] |
| 4-6 | Step 2 Profile | 看/补充字段 | 通过 | [ ] |
| 7-9 | Step 3 Complaint | 填主诉/风险/干预类型 | 通过 | [ ] |
| 10-12 | Step 4 Appointment | 选日期/时间/类型 | 通过 | [ ] |
| 13-15 | Step 5 Consent | 勾选/上一步/确认创建 | POST 201 跳 detail | [ ] |

## 2.4 /episodes/:id 6 个 tab
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | tab "概览" | 点击 | 加载 | [ ] |
| 2 | tab "知情同意" | 点击 + 主 CTA | 加载 + modal 打开/关闭 | [ ] |
| 3 | tab "评估" | 点击 + 派发评估 | 加载 + 流程 | [ ] |
| 4 | tab "笔记" | 点击 + 写笔记 | 加载 + 创建笔记 | [ ] |
| 5 | tab "目标" | 点击 + 加目标 | 加载 + 创建 | [ ] |
| 6 | tab "课程" | 点击 + 派发课程 | 加载 + 流程 | [ ] |
| 7 | tab "附件" | 点击 + 上传 | 加载 + 上传成功 | [ ] |
| 8 | "结束 episode" 按钮 | 点击 + 确认 | 状态 closed | [ ] |

## 2.5 /research-triage
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | bucket L1 | 点击 | 候选过滤 | [ ] |
| 2 | bucket L2-L4 | 点击 | 同上 | [ ] |
| 3 | 候选行点击 | 点击 | 详情面板 | [ ] |
| 4 | "覆写风险等级" | 点击 → 选 → PATCH | 200 + 行更新 | [ ] |
| 5 | AI 建议面板 (回归 23f94e6) | 触发 | JSON parse 鲁棒, 不显示原文 | [ ] |

## 2.6 /collaboration
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | tab Inbox | 点击 | 加载转介列表 | [ ] |
| 2 | 转介行 - 接受 | 点击 | POST/respond | [ ] |
| 3 | 转介行 - 拒绝 | 点击 | POST/respond | [ ] |
| 4 | tab "我的派单" | 点击 | 加载 | [ ] |
| 5 | "派单" 按钮 (admin 视角) | 点击 | 弹分配 modal | [ ] |

## 2.7 /audit
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | filter dropdown 操作类型 | 改 | 列表过滤 | [ ] |
| 2 | filter dropdown 用户 | 改 | 过滤 | [ ] |
| 3 | 分页 next/prev | 点击 | 翻页 | [ ] |

## 2.8 /settings (5 group × 多 tab)
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | group "我的" → 基本信息 → 保存 | PATCH | 200 toast | [ ] |
| 2 | group "我的" → 咨询师档案 → 保存 | PATCH | 200 | [ ] |
| 3 | group "我的" → 修改密码 → 提交 | PATCH | 200 | [ ] |
| 4 | group "门面" → 品牌 → 保存 | PATCH | 200 | [ ] |
| 5 | group "组织" → 基本信息 → 保存 | PATCH | 200 | [ ] |
| 6 | group "组织" → 成员管理 → 邀请 | POST invite | 201 | [ ] |
| 7 | group "组织" → 班级管理 (school) | CRUD | OK | [ ] |
| 8 | group "经营" → 资质认证 → 保存 | PATCH | 200 | [ ] |
| 9 | group "经营" → 公开服务 → 配置 | PATCH | 200 | [ ] |
| 10 | group "经营" → EAP 合作 → 添加 | POST | 201 | [ ] |
| 11 | group "经营" → 订阅 → 查看 | GET | 显示 license info | [ ] |
| 12 | group "安全" → 审计日志 → 加载 | GET | 列表 | [ ] |
| 13 | group "安全" → 触发分流配置 → 保存 | PUT | 200 | [ ] |

## 2.9 /availability
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | "+ 添加时段" | 选 + 点击 | slot 加入 | [ ] |
| 2 | 时段删除 | 点击 X | slot 移除 | [ ] |
| 3 | "保存" | PATCH | 200 toast | [ ] |
| 4 | "重置" | 点击 | 还原 | [ ] |

## 2.10 AI 生成流真实跑 6 类内容 — 重点验证 5 个 admin-library 浅 copy 嫌疑

| 类型 | 入口 | 验证点 | 状态 | Bug |
|------|------|-------|------|-----|
| **量表 scale** | /admin/library/scales → AI 生成 | 完整对话 → 保存 → 进编辑页看到 dim/items/rules | [ ] | |
| **目标 goal** | /admin/library/goals → AI 生成 | 完整 → 保存 → 进编辑页看到完整 objectives | [ ] | |
| **协议 agreement** | /admin/library/agreements → AI 生成 | 完整 → 保存 → 进编辑页看到 sections/content | [ ] | |
| **方案 scheme** | /admin/library/schemes → AI 生成 | 完整 → 保存 → 进编辑页看到 sessions | [ ] | |
| **课程 course** | /admin/library/courses → AI 生成 | 完整 → 保存 → 进编辑页看到 lessons/章节 | [ ] | |
| **笔记模板 template** | /admin/library/templates → AI 生成 | 完整 → 保存 → 进编辑页看到 fieldDefinitions | [ ] | |

---

# Tier 3 — Portal C 端 + 公开页

预估按钮数: ~30, tool 调用 ~120

## 3.1 /portal (HomeTab)
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | "我的服务" 卡 | 点击 | 跳 /portal/services | [ ] |
| 2 | "档案" 卡 | 点击 | 跳 /portal/archive | [ ] |
| 3 | "账户" 卡 | 点击 | 跳 /portal/account | [ ] |
| 4 | 通知 item | 点击 | 跳详情 | [ ] |

## 3.2 /portal/services
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | 服务行点击 | 点击 | 跳 /portal/services/:kind/:id | [ ] |
| 2 | "预约" 按钮 | 点击 | 跳 /portal/book | [ ] |

## 3.3 /portal/services/:kind/:id (个咨/团辅/课程)
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | "查看笔记" | 点击 | modal/新页 | [ ] |
| 2 | "取消预约" | 点击 → 确认 | 状态变 | [ ] |
| 3 | "联系咨询师" | 点击 | 启动会话 | [ ] |
| 4 | "查看历史" | 点击 | timeline 加载 | [ ] |

## 3.4 /portal/book
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | 选咨询师 | 点击 | 选中 | [ ] |
| 2 | 选日期 | 点击 | 高亮 | [ ] |
| 3 | 选时间 slot | 点击 | 选中 | [ ] |
| 4 | "确认预约" | 点击 | POST 201, 跳 services | [ ] |

## 3.5 /portal/archive
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | 评估行点击 | 点击 | 跳 /portal/archive/results/:id | [ ] |
| 2 | timeline event | 点击 | 详情 | [ ] |

## 3.6 /portal/archive/results/:id
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | "查看 AI 解读" | 点击 | AI panel 渲染, 无 JSON parse 失败 | [ ] |
| 2 | "下载报告" | 点击 | PDF 生成下载 | [ ] |
| 3 | "查看走势图" | 点击 | 图表 | [ ] |

## 3.7 /portal/account 4 个子页
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | account → 资料 → 保存 | PATCH | 200 | [ ] |
| 2 | 改头像 | 上传 | 200 + 显示 | [ ] |
| 3 | account → 同意 → 重读 | 点击 | modal 打开协议 | [ ] |
| 4 | account → 我的孩子 → 邀请 | POST | 200 + token | [ ] |
| 5 | account → 修改密码 → 提交 | PATCH | 200 | [ ] |
| 6 | "退出登录" | 点击 | 跳 /login | [ ] |

## 3.8 公开页 (无登录)
| # | 路径 | 验证 | 状态 |
|---|------|------|------|
| 1 | /register/counseling/{slug} | 注册表单可用, POST 201 跳 portal | [ ] |
| 2 | /assess/{id} | 评估题加载, 提交 200 | [ ] |
| 3 | /enroll/{id} | 报名表单 | [ ] |
| 4 | /checkin/{id}/{sid} | 打卡 | [ ] |
| 5 | /course-enroll/{id} | 课程报名 | [ ] |
| 6 | /invite/{token} | parent-binding 表单 | [ ] |
| 7 | /legal/privacy | 200, 非占位空页 | [ ] |
| 8 | /legal/terms | 200, 非占位空页 | [ ] |

---

# 已发现 bug

(尚未发现 bug, 走查中持续追加)

<!-- 模板:
### BUG-NNN — 一句话描述
- 严重度: BLOCKER | MAJOR | MINOR
- 触发行: <Tier>.<page>#<row>
- 复现:
  1. ...
  2. ...
- 期望: ...
- 实际: ...
- 怀疑文件: client/src/...
- 状态: 待修 / 已修(<sha>) / 已验证(<sha>)
-->

---

# 接续断点

**当前状态**: 框架已建立, 等待 Chrome MCP 浏览器扩展连接  
**下一步**: 用户检查 Chrome 扩展状态 → list_connected_browsers 返回非空数组 → 开始 Tier 1.1  
**当前 tab URL**: 无 (未启动浏览器会话)  
**登录身份**: 待登录 a@test.psynote.cn  
**最近 commit**: 9fe2621 chore: alpha 测试用 3 个 fresh 账号创建脚本入库 (HEAD 与 origin 同步)
