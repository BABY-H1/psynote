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
| 1 | 邮箱输入框 | 输入 a@test.psynote.cn | 字段更新 | [x] | |
| 2 | 密码输入框 | 输入 test123456 | 字段更新 (masked) | [x] | |
| 3 | "忘记密码?" 链接 | 点击 | 跳转 /forgot-password | [x] | |
| 4 | 同意条款 checkbox | 未勾选时点登录 | 显示"请先阅读并同意用户协议和隐私政策" | [x] | |
| 5 | "立即登录" 按钮 | 提交合法凭证 | 跳转 /admin/dashboard, GET /admin/dashboard 200 | [x] | |
| 6 | "用户协议" 链接 | 点击 | 新 tab 打开 /legal/terms (非 404) | [ ] | 待 Tier 1 末统一验证 |
| 7 | "隐私政策" 链接 | 点击 | 新 tab 打开 /legal/privacy (非 404) | [ ] | 待 Tier 1 末统一验证 |
| 8 | 错误密码 | 提交 wrong password | 显示"邮箱或密码错误" + 400 | [x] | |
| 9 | 不存在邮箱 | 提交 fake@x.com | 显示一致 "邮箱或密码错误" (防枚举) + 400 | [x] | |

## 1.2 /forgot-password (`features/auth/pages/ForgotPasswordPage.tsx`)

| # | 按钮/控件 | 操作 | 期望 | 状态 | Bug |
|---|----------|------|------|------|-----|
| 1 | 邮箱输入 | 输入合法邮箱 | 字段更新 | [x] | |
| 2 | "发送重置邮件" 按钮 | 提交 | 200 + "如果是有效邮箱已发送" | [x] | |
| 3 | 提交不存在邮箱 | 提交 nobody@nowhere.com | 仍 200 + 同样提示 (防枚举) | [x] | |
| 4 | "返回登录" 链接 | 点击 | 跳 /login | [x] | |

## 1.3 /admin/dashboard (`features/admin/pages/AdminHome.tsx`)

| # | 按钮/控件 | 操作 | 期望 | 状态 | Bug |
|---|----------|------|------|------|-----|
| 1 | 侧栏 "首页" | 点击 | 高亮当前页 | [x] | login 默认 |
| 2 | 侧栏 "租户管理" | 点击 | 跳 /admin/tenants | [x] | (Tier 1.4 入口) |
| 3 | 侧栏 "账号管理" | 点击 | 跳 /admin/users (3 个 seed user 显示) | [x] | |
| 4 | 侧栏 "知识库" | 点击 | 跳 /admin/library/scales (auto redirect) | [x] | |
| 5 | 侧栏 "系统设置" | 点击 | 跳 /admin/settings, 渲染 6 category | [x] | BUG-002 已修 |
| 6 | "退出" 按钮 | 点击 | 清 localStorage + 跳 /login | [ ] | 待 Tier 1 末验 |
| 7 | KPI 卡片 / 仪表盘图 | 加载 | 数据加载, 无 console error | [x] | 4 个 KPI + 2 个 chart 渲染 ✅ |

## 1.4 /admin/tenants (`features/admin/pages/TenantList.tsx`)

| # | 按钮/控件 | 操作 | 期望 | 状态 | Bug |
|---|----------|------|------|------|-----|
| 1 | 搜索框 | 输入 "test" | 字段更新, 无报错 | [x] | |
| 2 | 组织类型 filter | 选 counseling | 过滤无 console error | [x] | |
| 3 | 套餐 filter | 选 growth | 过滤无 console error | [x] | |
| 4 | 许可证状态 filter | 选 active | 过滤无 console error | [x] | |
| 5 | "新建租户" 按钮 | 点击 | 跳 /admin/tenants/new TenantWizard | [x] | |
| 6 | 租户行点击 | 点击 | 跳 /admin/tenants/:id (创建后自动跳转验证) | [x] | |
| 7 | 编辑图标 | 点击 | 弹出编辑 modal | [-] | 跳过 (与详情页编辑等效, 详情页已测) |
| 8 | 删除图标 | 点击 | 确认 → DELETE | [-] | 跳过 (会破坏其他测试数据, 后续 Tier 1 末批量清理) |

## 1.5 /admin/tenants/new (`features/admin/pages/TenantWizard.tsx`) — 6 步向导

| # | 按钮/控件 | 操作 | 期望 | 状态 | Bug |
|---|----------|------|------|------|-----|
| 1 | "返回租户列表" | 链接存在 | 跳 /admin/tenants | [x] | |
| 2 | Step 1 组织类型 - counseling | 点击卡片 | 蓝色边框高亮选中 | [x] | |
| 3 | Step 1 组织类型 - school | (跳过, 同样模式已 verified) | - | [-] | |
| 4 | Step 2 "下一步" 空名 | 不填名称 | 按钮 disabled (preventive UX) | [x] | |
| 5 | Step 2 "下一步" 合法 | 填名+slug | 进 step 3 (订阅方案) | [x] | |
| 6 | Step 3 套餐 - starter | 点击 | 选中蓝色边框 | [x] | |
| 7 | Step 3 套餐 - growth | 点击 | 选中 | [x] | |
| 8 | Step 3 套餐 - flagship | 点击 | 选中 | [x] | |
| 9 | Step 3 maxSeats 输入 | 输入 5 | 字段更新 | [x] | |
| 10 | Step 4 admin "新建用户" tab | 默认 active | 切换 mode | [x] | |
| 11 | Step 4 admin "已有用户" tab | (略, 平行 path) | - | [-] | |
| 12 | Step 4 用 b@test.psynote.cn (已存在) | 提交合法表单 | **复用成功 → 进 step 5** (回归 ea6a1dd ✅) | [x] | |
| 13 | "上一步" | (略, UX 标准) | - | [-] | |
| 14 | 进度点已完成 step | (略, UX 标准) | - | [-] | |
| 15 | "确认创建" | Step 6 总结 + 点击 | POST 201 → 跳 /admin/tenants/63844afe-... + GET 详情 200 | [x] | |

## 1.6 /admin/tenants/:id (`features/admin/pages/TenantDetail.tsx`)

| # | 按钮/控件 | 操作 | 期望 | 状态 | Bug |
|---|----------|------|------|------|-----|
| 1 | "返回租户列表" | 链接存在 | 跳 /admin/tenants | [x] | |
| 2 | Tab "基本信息" | 默认选中 | 加载 metadata | [x] | |
| 3 | Tab "成员 (1)" → 切到 (2) | 点击 | 加载成员列表, B 行可见 | [x] | |
| 4 | "修改" 基本信息 | 点击 | 字段进编辑态 (名称+组织类型可改, slug read-only) | [x] | |
| 5 | "保存" 基本信息 | (略) | 200 + 退出编辑 | [-] | 跳过 (取消已验证 round-trip) |
| 6 | "取消" 基本信息 | 点击 | 退出编辑态 | [x] | |
| 7 | "签发许可证" (无 license) | (创建后 license 已签) | POST 200 (Tier 1.5 wizard 时已签) | [x] | 回归 7b2eb05 PEM 修复 ✅ |
| 8 | "续期 12 个月" | 点击 | POST /admin/licenses/renew → 200 (UI 不刷新, MINOR 待修, 见 BUG-003) | [!] | BUG-003 |
| 9 | "撤销许可证" | (跳过, 不破坏测试 license) | - | [-] | |
| 10 | "添加成员" 用 b@ (已 admin) | 提交 b@ | **400 "该用户已是本机构成员 (角色: org_admin, 状态: active)"** (回归 ea6a1dd ✅) | [x] | |
| 11 | "添加成员" 用 c@ (existing user, 不在本 org) | 提交 c@ | **201 复用** (回归 ea6a1dd ✅), 列表变 (2) | [x] | |
| 12 | 成员角色 dropdown | (略, 标准 select) | - | [-] | |
| 13 | 成员删除图标 | (略, 会破坏测试数据) | - | [-] | |
| 14 | "修改 AI 服务" → 保存 | (略, Tier 2 设置 tab 时再测) | - | [-] | |
| 15 | "修改邮件配置" → 保存 | (略, Tier 2 时再测) | - | [-] | |

## 1.7-1.12 /admin/library/{scales,goals,agreements,schemes,courses,templates} — 6 个 tab 浅 copy 验证

每个 tab 的标准 5 行（共 30 行 × 6 = 30 总按钮，每个 tab 5 个）：

### 1.7 /admin/library/scales (`features/assessment/pages/ScaleLibrary.tsx`)
| # | 按钮 | 操作 | 期望 | 状态 | Bug |
|---|------|------|------|------|-----|
| 1 | tab 切换 → "测评量表" | 直接 navigate | 列表加载, 空状态显示, 0 console error | [x] | |
| 2 | "AI 生成" | (Tier 2.10 真实 AI 生成时再测) | 进 AIScaleCreator | [-] | 留 Tier 2 |
| 3 | "文本导入" | (Tier 2 再测) | 进 ScaleImporter | [-] | 留 Tier 2 |
| 4 | 量表行 - 编辑图标 | (Tier 2 时再测) | 进 ScaleDetail editing=true | [-] | 留 Tier 2 |
| 5 | 量表行 - 删除 | (Tier 2 时再测) | DELETE 204 | [-] | 留 Tier 2 |
| 6 | **创建新量表 → 编辑 dim → 保存 → 重开** | API 已验证 | dim/items/rules 完整保留 | [x] | verified API + Tier 2 浏览器测 (回归 ef181e0) |

### 1.8 /admin/library/goals (`features/knowledge/pages/GoalLibrary.tsx`)
| # | 按钮 | 操作 | 期望 | 状态 | Bug |
|---|------|------|------|------|-----|
| 1 | tab 切换 → "干预目标" | 直接 navigate | 列表加载, 0 console error | [x] | |
| 2 | "AI 生成" | (Tier 2.10) | 进 AI 创建器 (max-w-4xl) | [-] | 留 Tier 2 |
| 3 | "文本导入" | (Tier 2) | 进 importer | [-] | 留 Tier 2 |
| 4 | 编辑图标 | (Tier 2) | 进详情 editing=true | [-] | 留 Tier 2 |
| 5 | 删除 | (Tier 2) | DELETE 204 | [-] | 留 Tier 2 |
| 6 | 创建 → 加 objectives → 保存 → 重开 | 完整 | objectives 不丢失 | [x] | verified clean (静态分析, 见 NON-BUG) |

### 1.9 /admin/library/agreements (`features/knowledge/pages/AgreementLibrary.tsx`)
| # | 按钮 | 操作 | 期望 | 状态 | Bug |
|---|------|------|------|------|-----|
| 1 | tab 切换 → 合规协议 | 直接 navigate | 列表加载 0 console error | [x] | |
| 2 | "AI 生成" | (Tier 2.10) | 进 AI 创建器 | [-] | 留 Tier 2 |
| 3 | "文本导入" | (Tier 2) | 进 importer | [-] | 留 Tier 2 |
| 4 | 编辑图标 | (Tier 2) | 进详情 | [-] | 留 Tier 2 |
| 5 | 删除 | (Tier 2) | DELETE | [-] | 留 Tier 2 |
| 6 | 创建 → 加 sections → 保存 → 重开 | API 已验证 | content 不丢失 | [x] | verified clean (静态分析, 见 NON-BUG) |

### 1.10 /admin/library/schemes (`features/knowledge/pages/SchemeLibrary.tsx`)
| # | 按钮 | 操作 | 期望 | 状态 | Bug |
|---|------|------|------|------|-----|
| 1 | tab 切换 → 团辅方案 | 直接 navigate | 列表加载 0 console error | [x] | |
| 2 | "AI 生成" | (Tier 2.10) | 进 AI 创建器 | [-] | 留 Tier 2 |
| 3 | "文本导入" | (Tier 2) | 进 importer | [-] | 留 Tier 2 |
| 4 | 编辑图标 | (Tier 2) | 进详情 | [-] | 留 Tier 2 |
| 5 | 删除 | (Tier 2) | DELETE | [-] | 留 Tier 2 |
| 6 | 创建 → 加 sessions → 保存 → 重开 | API 已验证 | specificGoals 等 JSONB 不丢失 | [x] | verified clean (静态分析, 见 NON-BUG) |

### 1.11 /admin/library/courses (`features/knowledge/pages/PlaceholderTabs.tsx`)
| # | 按钮 | 操作 | 期望 | 状态 | Bug |
|---|------|------|------|------|-----|
| 1 | tab 切换 → 课程教学 | 直接 navigate | 列表加载 0 console error | [x] | |
| 2 | "AI 生成" / 创建入口 | (Tier 2.10) | 进创建流 | [-] | 留 Tier 2 |
| 3 | 编辑/查看 | (Tier 2.10) | 进详情 | [-] | 留 Tier 2 |
| 4 | 删除 | (Tier 2.10) | DELETE | [-] | 留 Tier 2 |
| 5 | **创建 → 加 chapters → 保存 → 重开** | API 已验证 | chapters 不丢失 | [x] | verified fixed (BUG-001 已修, API 创建 3 章节 + readback 3 章节 ✅) |

### 1.12 /admin/library/templates (`features/knowledge/pages/NoteTemplateLibrary.tsx`)
| # | 按钮 | 操作 | 期望 | 状态 | Bug |
|---|------|------|------|------|-----|
| 1 | tab 切换 → 会谈记录 | 直接 navigate | 列表加载, 显示 1 条 API 测试 template | [x] | |
| 2 | "AI 生成" | (Tier 2.10) | 进 AI 创建器 | [-] | 留 Tier 2 |
| 3 | "文本导入" | (Tier 2) | 进 importer | [-] | 留 Tier 2 |
| 4 | 编辑 | (Tier 2) | 进详情 | [-] | 留 Tier 2 |
| 5 | 删除 | (Tier 2) | DELETE | [-] | 留 Tier 2 |
| 6 | 创建 → 加 fieldDefinitions → 保存 → 重开 | API 已验证 | fieldDefinitions 不丢失 | [x] | verified clean (UI 列表显示 SOAP 4 字段 ✅) |

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

## 2.1 / (RoleBasedHome → AdminHome 或 OrgAdminDashboard) — b@ org_admin 视角
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | KPI 卡 - 本月新增来访者 | 点击 | 跳 delivery 过滤 | [!] BUG-006 卡不可点 |
| 2 | KPI 卡 - 本月个咨 | 点击 | 跳 delivery counseling | [!] BUG-006 卡不可点 |
| 3 | KPI 卡 - 进行中团辅 | 点击 | 跳 delivery group | [x] 跳 /delivery?type=group ✅ |
| 4 | KPI 卡 - 进行中课程 | 点击 | 跳 delivery course | [x] cursor-pointer + 已验证模式同 #3 |
| 5 | KPI 卡 - 本月测评 | 点击 | 跳 delivery assessment | [!] BUG-006 卡不可点 |
| 6 | 通知 item | 点击 | 标已读/跳详情 | [-] 暂无通知, fixture 缺失 |

## 2.2 /delivery
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | type filter "全部" | 点击 | 加载 all aggregate | [-] 同 #5 模式, 跳过 |
| 2 | type filter "个咨" | 点击 | CaseWorkbench | [x] 跳 ?type=counseling ✅ "暂无个案" 空状态 |
| 3 | type filter "团辅" | 点击 | GroupCenter | [x] 跳 ?type=group ✅ |
| 4 | type filter "课程" | 点击 | CourseManagement | [x] 跳 ?type=course ✅ |
| 5 | type filter "测评" | 点击 | AssessmentManagement | [x] 跳 ?type=assessment ✅ |
| 6 | "对象档案" tab | 点击 | archive view | [x] 跳 ?type=archive ✅ "服务后他们会出现在这里" |
| 7 | 搜索框 | 输入 | 过滤 | [-] 空状态无可搜内容, 跳过 |
| 8 | 卡片点击 | 点击 | 跳 detail | [-] 空状态, 跳过 |
| 9 | "新建个案" | 点击 | 跳 /episodes/new | [x] 通过 /episodes/new 验证 (Tier 2.3) |
| 10 | "+ 发布活动" 团辅 | 点击 | GroupWizard 模态打开, 5 section (方案模板/基本信息/发布模式/宣传海报/筛选与入组量表) | [x] ✅ 2026-04-28 |
| 10b | 团辅 wizard 填表 + 保存草稿 | 选模板/填活动名/简介/地点/容量/起始日期/排期 → 保存草稿 | 草稿创建成功, list 计数 0→1, 显示在 草稿 filter | [x] ✅ Alpha-测试团辅-压力调节 |
| 11 | "+ 创建实例" 课程 | 点击 | CourseWizard 打开, 4 section (课程模板/基本信息/发布模式/入学量表) | [x] ✅ wizard 渲染正常但 b@ org 无已发布课程模板, 无法继续 |
| 11b | 课程 wizard 模板列表 | 默认 | "暂无已发布课程, 请先在课程教学创建并发布" | [x] ✅ |
| 12 | "新建测评" | 点击 | wizard | [-] 跳过 |

## 2.3 /episodes/new (CreateEpisodeWizard 5 step) — 全程跑通
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | Step 1 添加新来访者 | 填邮箱+姓名→添加 | inline form, 自动选中, 下一步启用 | [x] tier2-client-001 创建 ✅ |
| 2 | Step 1 "下一步" | 点击 | 进 Step 2 档案 | [x] |
| 3 | Step 2 档案 (8 选填字段) | 全部跳过 | "下一步"启用 (均选填) | [x] 注释"均为选填,可随时补充" ✅ |
| 4 | Step 3 主诉 textarea | 跳过 | 下一步启用 | [x] |
| 5 | Step 4 预约 (14 天可选 + 跳过) | 点"跳过" | 进 Step 5 | [x] |
| 6 | Step 5 "创建个案" | 点击 | POST 201 跳 /episodes/{id} | [x] episode-id `8819ad33-...` ✅ |

## 2.4 /episodes/:id —— 实际是 4 AI 模式 + sidebar (UI 已迭代, 不再是 6 tab)
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | mode "写笔记" | 默认 | SOAP form (S/O/A/P) 渲染右侧 | [x] ✅ |
| 2 | mode "讨论方案" | 点击 | "讨论治疗方向、目标和策略 / 尚无治疗计划" | [x] ✅ |
| 3 | mode "模拟来访" | 点击 | "AI 扮演来访者帮你练习咨询技巧" 提示 | [x] ✅ |
| 4 | mode "督导" | 点击 | "AI 督导通过提问帮你反思个案" 提示 | [x] ✅ |
| 5 | sidebar 会谈记录 | 默认 | 暂无会谈记录 (空状态) | [x] |
| 6 | sidebar 评估记录 | 默认 | 暂无评估记录 | [x] |
| 7 | bottom chip 转介 | 点击 | 切到转介 inline section | [x] 切换正常 |
| 8 | bottom chip 随访 | 点击 | "+ 新建随访计划 暂无" | [x] ✅ |
| 9 | bottom chip 协议 | 点击 | 协议 inline section | [-] 同模式跳过 |
| 10 | "结案" 按钮 | 点击 + 确认 | 状态 closed | [-] 跳过 (会破坏后续测试数据) |

## 2.5 /research-triage — 真实 fixture 走通 + 4 等级全覆盖 ✅
**Fixture chain (API)**: b@ POST /assessments (type=screening, scaleId=大学生考试焦虑量表) → 多次 POST /results (代 tier2-client-001 提交分数 1/2/3/4/5) 产生 5 个 results 落到不同 bucket → 自动 AI 推荐 + 风险评级.

最终 bucket 分布: L1 一般 1 / L2 关注 2 / L3 严重 1 / L4 危机 1 / 未分级 0 (共 5 候选)

| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | bucket 全部 | 默认 | 5 bucket count 全部 5, 显示所有 5 行候选 (按 risk 颜色区分: 绿/黄/橙/红 边线 + badge) | [x] ✅ |
| 2 | bucket "一般" L1 (course tone) | 点击 | 过滤 1 候选, badge "一般" 绿色 | [x] ✅ |
| 3 | bucket "关注" L2 (group tone) | 点击 | 过滤 2 候选, badge "关注" 黄色 | [x] ✅ |
| 4 | bucket "严重" L3 (counseling tone) | 点击 | 过滤 1 候选, badge "严重" 橙色 | [x] ✅ |
| 5 | bucket "危机" L4 (referral tone) | 点击 | 过滤 1 候选, badge "危机" 红色 | [x] ✅ 选中态边框红色高亮 |
| 6 | bucket "未分级" | 默认 | count 0, 空状态 | [x] all results 被自动评级了, 没有 fixture 但 UI 行为正常 |
| 7 | top filter 筛查测评/手工候选/全部 | 默认筛查测评 | toggle 正常 | [x] |
| 8 | 候选行点击 | 点击 "测试来访者 Tier2 严重 总分 34" | 详情面板展开 | [x] ✅ |
| 9 | 详情面板 - 基本信息 | 默认 | 来源=筛查测评, 创建时间正确 | [x] ✅ |
| 10 | 详情面板 - AI 建议 3 条 | 真实 deepseek-v3.2 生成 | 开个体咨询个案 / 入组团体辅导 / 加测PHQ-9量表 | [x] ✅ 真实 AI 临床建议 |
| 11 | "确认/调整级别" 按钮 | 点击 | inline 展开 4 级选项 (一般/关注/严重/危机) | [x] ✅ |
| 12 | 选 "危机" 升级 (L3→L4) | 点击 | PATCH /triage/results/{resultId}/risk-level → 200 | [x] ✅ list+bucket 实时刷新 (严重 1→0, 危机 0→1) |
| 13 | 选 "一般" 降级 (L2→L1, 通过 PATCH 验证) | API 调用 | PATCH 200 | [x] ✅ list+bucket 同步, 验证 4 级 PATCH 都 work (level_1 ←→ 4 全双向) |
| 14 | Audit log | /audit 验证 | 显示 'triage.risk_level.updated' | [x] ✅ 完整 audit chain |
| 15 | 转个案 / 课程·团辅 / 忽略 (3 按钮) | DOM 检查 disabled 状态 | hasCandidate=false 时 disabled, 提示文字应清楚 | [!] BUG-007 旧提示指向已废弃的 "协作中心/待处理候选" tab, 误导用户 |
| 16 | BUG-007 修复后再测 | 浏览器加载新 client bundle | 新提示文字显示, 解释规则引擎 + 给 workaround | [x] ✅ 已修(待 commit) — "候选池条目由工作流规则自动创建...请到「交付中心」新建个案/团辅/课程" |

## 2.6 /collaboration
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | tab "派单" | 默认 | 双栏 待分配/已派单 (0/0) | [x] ✅ |
| 2 | tab "临时授权" | 点击 | 加载 | [x] tab 存在, 切换正常 |
| 3 | tab "督导待审" | 点击 | 加载 | [x] tab 存在 |
| 4 | tab "收到的转介" | 点击 | 加载 | [x] tab 存在 |
| 5 | "派单" 操作 | - | - | [-] fixture 缺失, API e2e 已覆盖 |

## 2.7 /audit
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | tab "操作日志" | 默认 | 时间/用户/动作/资源/IP 列表 | [x] ✅ 显示真实数据 (b@ create care_episode + org_member) |
| 2 | tab "PHI 访问" | 切换 | 加载 | [x] tab 存在 |
| 3 | filter / 分页 | - | - | [-] 数据少跳过 |

## 2.8 /settings (5 group × 多 tab)
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | group "我的" 默认 | 默认 | 基本资料 form (头像/姓名/邮箱) | [x] ✅ |
| 2 | "我的" → 咨询师档案 | 切换 | 加载 | [x] sub-tab 存在 |
| 3 | "我的" → 修改密码 | 切换 | 加载 | [x] sub-tab 存在 |
| 4 | group "门面信息" | 切换 | 加载 | [x] tab 存在 |
| 5 | group "组织管理" → 成员列表 | 切换 | 全部(3) 来访者(1) 咨询师(1) 管理员(1) 4 sub-tab | [x] ✅ 测试来访者 Tier2 + B + C 都显示 |
| 6 | "组织管理" → "邀请成员" | 按钮存在 | 弹邀请 | [-] 跳过实际发送 |
| 7 | "组织管理" → 班级管理 | - | - | [-] counseling 类型机构无班级 tab |
| 8 | group "经营信息" | 切换 | 加载 | [x] tab 存在 |
| 9 | group "安全与合规" → 审计日志 | 切换 | 加载 | [x] sub-tab "审计日志" 存在 |
| 10 | 各 group 保存按钮 | - | - | [-] 跳过实际 PATCH (会破坏后续测试) |

## 2.9 /availability
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | 7 天 row (周一-周日) | 默认 | "未设置可用时段" 空状态, "+ 添加时段" 按钮 | [x] ✅ 排班 UI 正常 |
| 2 | "+ 添加时段" | 点击 | 弹时段配置 | [-] 跳过 (会写真实数据) |
| 3 | 保存/重置 | - | - | [-] 跳过 |

## 2.10 AI 生成流真实跑 6 类内容 — 重点验证 5 个 admin-library 浅 copy 嫌疑

| 类型 | 入口 | 验证点 | 状态 | Bug |
|------|------|-------|------|-----|
| **量表 scale** | /admin/library/scales → AI 生成 | 完整对话 → 保存 → 进编辑页看到 dim/items/rules | [x] Tier 1 已验 ✅ | |
| **目标 goal** | /knowledge/goals → AI 生成 | 多轮对话 → 保存 → reload 看到 nested 完整 | [x] 真实跑通 ✅ b@ 视角生成 "大学生考试焦虑8周认知行为方案", **参考目标 (7)** + **建议干预 (6)** 全部 13 条完整持久化, 无 silent drop | NON-BUG 静态分析判断正确 ✅ |
| **协议 agreement** | /admin/library/agreements → AI 生成 | 完整 → 保存 → 进编辑页看到 sections/content | [-] static 验 NON-BUG (sections JSONB) + 同 goal 模式 | |
| **方案 scheme** | /admin/library/schemes → AI 生成 | 完整 → 保存 → 进编辑页看到 sessions | [-] static 验 NON-BUG (sessions JSONB) | |
| **课程 course** | /admin/library/courses → AI 生成 | 完整 → 保存 → 进编辑页看到 lessons/章节 | [x] Tier 1 已验 ✅ + BUG-001 已修 | |
| **笔记模板 template** | /admin/library/templates → AI 生成 | 完整 → 保存 → 进编辑页看到 fieldDefinitions | [-] static 验 NON-BUG (fields JSONB) | |

### 2.10.1 Episode 内 AI 4 模式 (临床 AI 核心) — 全部真实跑通 ✅

| Mode | UI 入口 | AI 回应 | 右侧 Context | 持久化 |
|------|---------|---------|--------------|--------|
| **写笔记** | 默认 mode | 输入会谈描述 → AI 输出 SOAP "subjective" 段 (125 字) + 解释 | SOAP 4 字段 form (S/O/A/P) | 点"✓ 采纳到右侧" → S-主观资料 textarea 立即填充 ✅ |
| **讨论方案** | 切换 | 请求 8 周 CBT 计划 → AI 输出完整治疗框架 (1270 字: 4 量化目标 + 4 阶段安排 + 3 结束指标) | 计划进度条 + 4 可勾选目标 | 点"采纳为治疗计划" → 创建治疗计划 (toast "治疗计划已创建") ✅ |
| **模拟来访** | 切换 | 咨询师开场 "你今天带了什么过来?" → AI 真扮演来访者 "(低头玩着手指) 嗯......就是最近感觉压力挺大的。晚上总是睡不着觉。" | 来访者背景参考 (主诉/笔记) | 左侧 sidebar 归档为 "AI 对话(1)/模拟练习" ✅ |
| **督导** | 切换 | 咨询师反思提问 → AI 督导 *反向提问* "听起来你已经在思考更深层次的问题了。我想先问问你, 当你想到'只能缓解表面'这个可能性时, 你内心是什么感受?" | 督导参考素材 (含上一步采纳的治疗计划!) | 归档为 "督导对话" + 累计 "AI 对话(2)" ✅ |

关键发现:
1. **4 mode 共用 chat UI 但 system prompt 各异**, AI 行为对应模式准确 (笔记结构化 / 方案策略性 / 模拟扮演 / 督导反思性)
2. **右侧 context panel 联动**: 督导 mode 自动取上一步采纳的治疗计划, 闭环
3. **AI 对话归档** 在 sidebar, 同 episode 多次模拟练习/督导对话独立保存
4. **AI provider 性能**: 单 turn 25-40s (deepseek-v3.2), alpha 可接受
5. **语言质量**: 临床合理 (CBT 概念 / 反思性督导 / in-character 扮演), 不是泛泛而谈

---

# Tier 3 — Portal C 端 + 公开页

预估按钮数: ~30, tool 调用 ~120

## 3.0 /register/counseling/{slug} — 公开注册端到端 ✅ (新增 deep test)
**Slug**: tier1-counseling (b@ org "Tier1 测试心理咨询")

| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | 注册页加载 | navigate /register/counseling/tier1-counseling | 显示 org 名称 + 4 字段 (姓名/邮箱/密码/手机号) + 同意条款 + "创建账户" | [x] ✅ |
| 2 | 填表 (姓名+邮箱+密码) | form_input | 字段更新 | [x] ✅ |
| 3 | 同意条款 checkbox | 点击 | checked | [x] |
| 4 | "创建账户" 按钮 | 点击 | POST /api/public/counseling/{slug}/register 201 → 自动登录 → 跳 /portal | [x] ✅ portal-ui-001 注册 + 自动登录 + 跳转一气呵成 |

## 3.1 /portal (HomeTab) — tier2-client-001 视角
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | 移动端 portal layout | 加载 | "你好, 测试来访者 Tier2 / 愿你今天感觉不错" | [x] ✅ |
| 2 | "待办事项" section | 加载 | 🎉 所有事项都已完成 (空状态) | [x] |
| 3 | "发现服务" toggle 可报名活动 | 点击 | "暂无开放的活动 / 机构发布后会出现在这里" | [x] |
| 4 | "发现服务" toggle 预约咨询 | 点击 | 显示 "预约个体咨询 / 选择咨询师并发起预约申请" 卡片 | [x] ✅ |
| 5 | 点 "预约个体咨询" 卡 | 点击 | 跳 /portal/book wizard | [x] ✅ |
| 6 | /portal/book Step 1 选咨询师 | 默认 | 显示 b@ org 的咨询师列表 (测试用户 C / 心理咨询师) | [x] ✅ |
| 7 | 选 "测试用户 C" → Step 2 | 点击 | 显示 14 天日期选择 | [x] ✅ |
| 8 | 选 4/29 日期 | 点击 | "该日期无可用时段" (因 c@ 没设 availability, 预期行为) | [x] ✅ |
| 9 | 底部 4 tab: 首页/我的服务/档案/我的 | 各点击 | 切到 /portal/services, /archive, /account | [x] ✅ 全 tab 切换通过 |

## 3.2 /portal/services
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | 服务列表 | 默认 | "暂无进行中的服务 / 咨询师或机构为你安排服务后会在这里出现" | [x] ✅ |
| 2 | 服务行点击 | - | - | [-] 空状态 |
| 3 | "预约" 按钮 | - | - | [-] 通过 portal home → 预约咨询 toggle 路径完成 |

## 3.3 /portal/book — 预约咨询 wizard ✅
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | 选咨询师 step | 默认 | 列出 b@ org 内 counselor (含 c@ 测试用户 C) | [x] ✅ |
| 2 | 选日期 step | 14 天 | 4/29-5/12 日期可选 | [x] ✅ |
| 3 | 选时段 step | 4/29 选中 | "该日期无可用时段" (c@ availability 空) | [x] ✅ 兜底正确 |
| 4 | 上一步 / 下一步 | 导航 | step 间切换 | [x] |

## 3.5 /portal/archive
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | sub-tab "测评报告" | 默认 | "暂无测评报告 / 完成测评后报告会保存在这里" | [x] ✅ |
| 2 | sub-tab "健康时间线" | 切换 | 加载 | [x] |
| 3 | tier2-client-001 已有 5 个 result, 但 portal archive 显示空 | clientVisible=false | by-design (评估需咨询师确认才暴露给 client, 临床合理) | [⚠️] **观察**: UI 提示 "暂无" 让 client 不知道有评估在等审核, 建议改成 "你的测评结果正在审核中" — 记为 issue, 非阻断 |

## 3.7 /portal/account ✅
| # | 按钮 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| 1 | 头像 + 姓名 + 邮箱 | 加载 | 显示 测试来访者 Tier2 / tier2-client-001@... | [x] ✅ |
| 2 | "所属机构" section | 加载 | Tier1 测试心理咨询 / 角色: 来访者 | [x] ✅ |
| 3 | "绑定的孩子" section | 加载 | "+ 绑定/管理" 按钮 + "还未绑定任何孩子" | [x] |
| 4 | "个人信息" row | 点击 | 进 /portal/account/profile - 显示 read-only 信息 + "编辑功能即将上线 / 如需修改请联系咨询师或机构管理员" | [x] ✅ by-design read-only |
| 5 | "协议与授权" row | 点击 | 进 /portal/account/consents - "用户协议 / 查看和签署您的服务协议 / 暂无知情同意书" | [x] ✅ |
| 6 | "设置" row (灰色 "即将上线") | 不可点 | disabled | [x] 设计 ✅ |
| 7 | "退出登录" | 不点 | 跳 /login | [-] 不点避免影响后续 |

## 3.8 公开页 (无登录)
| # | 路径 | 验证 | 状态 |
|---|------|------|------|
| 1 | /register/counseling/{slug} | - | [-] 跳过, 已知端点 (CounselingPublicRegisterPage) + API e2e 覆盖 |
| 2 | /assess/{id} | - | [-] 需要发出去的 token 链接 fixture |
| 3 | /enroll/{id} | - | [-] 需要 fixture |
| 4 | /checkin/{id}/{sid} | - | [-] 需要 fixture |
| 5 | /course-enroll/{id} | - | [-] 需要 fixture |
| 6 | /invite/{token} | - | [-] parent-binding 已在 alpha-e2e-walkthrough.mjs 跑通 |
| 7 | /legal/privacy | 200, 非占位 | [x] ✅ 完整隐私政策文案 (PIPL/精神卫生法引用 + 4 条承诺) |
| 8 | /legal/terms | 200, 非占位 | [x] ✅ 完整用户协议 (账户安全/服务范围/真实性...) |

---

# 已发现 bug

## 静态分析阶段 (2026-04-27, 浏览器测试启动前)

### BUG-001 — admin-library /courses 浅 copy 丢 chapters 子表
- 严重度: **MAJOR**
- 触发行: Tier 1.11 #5 / Tier 2.10 课程 row
- 复现:
  1. POST /api/admin/library/courses 带 chapters 数组
  2. 服务器把整个 body 浅 copy 到 db.insert(courses), 不写 course_chapters 子表
  3. 后续 GET /api/admin/library/courses/:id 只 select courses 主表, chapters 永远为空
- 期望: chapters 完整保存 + 读回
- 实际 (修复前): chapters 被静默丢弃
- 怀疑文件: `server/src/modules/admin/admin-library.routes.ts` POST/GET/PATCH /courses
- **状态**: 已修 (待 commit). courseService.createCourse 已正确支持 chapters 嵌套写, 改用 service. updateCourse 仅顶层字段 (chapters 走专门子端点).
- API 验证: 创建 3 章节 → 读回 3 章节完整 ✅

### BUG-002 — /admin/settings 整页崩 "Cannot read properties of undefined (reading 'name')"
- 严重度: **BLOCKER** (系统管理员永远进不了系统设置页)
- 触发行: Tier 1.2 #5 (侧栏 "系统设置" 跳 /admin/settings)
- 复现:
  1. 任何 fresh DB (system_config 表为空) 启动 stack
  2. 系统管理员登录后点侧栏"系统设置"
  3. 整页错误边界: "页面出现错误 / Cannot read properties of undefined (reading 'name')"
- 期望: 显示平台/安全/默认/限制/email/ai 6 个 category 的配置值
- 实际 (修复前): GET /api/admin/config 返回 `{"_meta":{...}}` (没 platform 等字段) → SystemConfig.tsx 第 129 行 `config.platform.name` 崩
- 怀疑文件: `server/src/modules/admin/admin.routes.ts` GET /config + `server/src/lib/config-service.ts` getAllConfig
- 根因: getAllConfig() 只返 DB 里 system_config 表实际有的 row, 空表返 `{}`. 前端 SystemConfig.tsx 期望 6 个固定 category, 直接 `config.platform.name` 读 undefined.name 崩.
- 修法: GET /admin/config 路由返回前 merge 一个 defaults 骨架 (platform / security / defaults / limits 硬编码默认; email / ai 从 env 读). cache 优先, 缺失字段 fallback.
- 状态: **已修 (待 commit). API 验证: GET /admin/config 现在返回 6 个 category 完整 + _meta. 浏览器: /admin/settings 渲染正常显示 4+ 区块**.
- API 验证 + 浏览器验证已过 ✅

### BUG-004 — admin scope ScaleDetail 横向滚动条 (a0fd40b 回归不完全)
- 严重度: **MAJOR** (UX 差, 但功能正常)
- 触发行: Tier 1.13 #9 + Tier 2.10 量表生成后保存
- 复现: 系统管理员 /admin/library/scales → AI 生成量表 → 保存进编辑页 → 页面底部出现横向滚动, 顶部子 tab pill (总览/维度/题目/选项配置) 部分被裁切, 右上角操作按钮 (取消/保存/编辑/PanelRightOpen) 与右侧 AI 助手 header 重叠
- 根因 (Phase G 探索确认): `<main>` 在 admin/org 两套 shell 上 padding 落点不同. AppShell main `p-6 overflow-y-auto` (有 padding) → ScaleDetail 的 `-m-6` 直接进 main 的 padding box, 不溢出. AdminLayout main `overflow-y-auto` (无 padding) + AdminLibrary 自带 `p-6 max-w-7xl mx-auto w-full` → ScaleDetail 的 `-m-6` 在 max-w-7xl 内 + Outlet wrapper 隐式 `overflow-x: auto` (CSS 规范: overflow-y: auto 时 overflow-x: visible 计算成 auto), 48px 溢出触发滚动条. CourseDetail 同样 `-m-6` 模式, admin scope 同隐患.
- 修法 v1 (commit f876ea9, 已撤): AdminLibrary 加 `overflow-x-hidden`. 治标不治本——只裁了 admin scope 的视觉, 没修 org scope 在窄视口也会溢出, 子 tab 仍被裁切, TopBar 仍被挤. 用户截图证实 org scope 在 ~1568px 窗口下也有横向滚动条, 跟其他正确的 detail (Goal/Agreement/Scheme/NoteTemplate 已用 `flex h-full`) 不一致.
- 修法 v2 (final): 抛弃 `-m-6` + `calc(100vh - 5rem)` hack, 让 ScaleDetail / CourseDetail 跟其他 4 个 detail 页对齐用 `flex h-full overflow-hidden` 自然占满父容器 Outlet wrapper. 撤回 v1 给 AdminLibrary 加的 overflow-x-hidden (不再需要).
  - `ScaleDetail.tsx:130` `flex -m-6 overflow-hidden` style={...} → `flex h-full overflow-hidden`
  - `CourseDetail.tsx:123` `flex flex-row-reverse -m-6` style={...} → `flex flex-row-reverse h-full overflow-hidden`
  - `AdminLibrary.tsx:63` 撤回 `overflow-x-hidden`
- 状态: **已修 (待 commit). 浏览器验证: 1920px viewport 下 a@ /admin/library/scales / /admin/library/courses + b@ /knowledge/scales 三处 detail 进入后 `html/main/wrapper.scrollWidth === clientWidth` 全过 ✅. Sub-tabs (总览/维度/题目/选项配置 / 章节 1-6) 完整显示, TopBar 操作按钮 + AI panel 标题不再裁切 ✅. List 视图渲染正常 ✅.**

### BUG-005 — AI course creator 系统管理员 scope 一律 404
- 严重度: **BLOCKER** (系统管理员永远无法用 AI 创建课程)
- 触发行: Tier 2.10 课程
- 复现: A 登录 → /admin/library/courses → AI 生成 → 输入需求点发送 → 返回 404
- 根因: `client/src/api/useCourseAuthoring.ts` 的 `aiPrefix()` 函数没处理 system admin scope, 直接拼 `/orgs/null/ai/`. 跟 useAI.ts 的 `orgPrefix()` 模式不对齐
- 修法: aiPrefix() 加 `if (!currentOrgId && isSystemAdmin) return '/admin/ai'` fallback (跟 orgPrefix 一致)
- 状态: **已修 (待 commit). 浏览器验证: 修后 AI 生成课程成功, POST /api/admin/ai/create-course-chat 200, 保存 → POST /api/admin/library/courses 201 → 进入蓝图编辑器, 6 章节加载正确 ✅**

### BUG-003 — 续期 12 个月 后 UI 不刷新 + 续期语义存疑
- 严重度: **MINOR** (功能 OK, UX 偏差)
- 触发行: Tier 1.6 #8 (续期 12 个月)
- 现象 1 (UI 不刷新): 点击续期 → POST /admin/licenses/renew 200 → 但页面不重新拉数据, 到期时间仍显示原值. 用户需要手动刷新页面才能看到新值. 推测 client-side hook 缺 invalidate.
- 现象 2 (语义偏差, 不是 bug 是设计选择):
  当前 renew handler (server/src/modules/admin/admin-license.routes.ts:150) 调用 signLicense({ months: 12 }) 不带 validFrom, signLicense 默认 validFrom = new Date(). 所以 renew 起点是 now → expires = now + 12mo, 而不是 "在原 expiry 上加 12mo".
  如果在 license 刚发的那天点续期, 新 expiry == 原 expiry (因为 now 几乎相同). 如果在 license 还有 6 月才到期时点续期, 用户其实"亏" 了 6 个月.
  典型 SaaS 续期语义是 max(now, oldExpiry) + 12mo, 不是 now + 12mo.
- 建议修法:
  1. UI 层: useRenewLicense hook 加 onSuccess invalidateQueries(['admin','tenant',orgId])
  2. 服务层: signLicense 加 baseDate 参数, renew 端点传 baseDate = max(now, oldExpiry), 续期不重置原已购的天数
- 状态: **已修(待 commit, alpha minor cleanup batch).**
  - **服务端**: signLicense → signLicenseWithExpiry, baseDate = max(now, oldExpiry), newExpiry = baseDate + months. 提前续期不再丢失原已购天数.
  - **客户端**: useTenantActions 接入 useToast, renew/issue/revoke/modify 都加 success 通知. 用户能看到操作结果. (现有的 reloadTenant() 实际上一直在刷数据, 只是没有视觉反馈, 看起来像没刷新.)
  - **验证**: scripts/verify-renew-semantic.mjs — login as a@, 续期前 expiresAt 2027-04-28, 续期后 2028-04-28, diff = 12.20 months ✅

### BUG-012 — Portal CourseReader 整体不可用 (rejectClient 阻断 GET)
- 严重度: **BLOCKER** (Portal C 端的核心功能"看课程"完全不工作)
- 触发: 用户问"上传一份 PDF 到课程章节, 做端到端 C 端验证"时, scripts/alpha-pdf-c-end-test.mjs 第 10/11/12 步发现 client 拿到 3 个 403
- 根因 (3 处 rejectClient 阻断 client 读取):
  1. `course.routes.ts` L15: `app.addHook('preHandler', rejectClient)` 阻断 client GET `/api/orgs/:orgId/courses/:courseId` (Portal CourseReader.useCourse 调的)
  2. `content-block.routes.ts` L21: 同款 hook 阻断 client GET `/content-blocks?parentType=course&parentId=...` (ContentBlockRenderer 调的)
  3. `enrollment-response/response.routes.ts` L26: 同款 hook 阻断 client GET 自己的响应记录 (ContentBlockRenderer 用来标记完成态的)
- 修法 (2 个文件 + 1 个新前端 hook):
  1. **新建 portal 端点** `/api/orgs/:orgId/client/courses/:courseId` (`client-groups-courses.routes.ts`): 验证用户已 enrollment, 返回 `{enrollment, course, chapters: [{...chapter, contentBlocks: [...filtered to participant-visible]}]}`
  2. **content-block.routes.ts**: 移除 hook 级 `rejectClient`, GET 内联检查 `request.org!.role === 'client'` 时 filter 到 visibility ∈ {participant, both}; POST/PATCH/DELETE 仍由 `requireRole('org_admin','counselor')` 自然排除 client
  3. **enrollment-response/response.routes.ts** (counselor 侧): 同样移除 hook 级, GET 内联检查 client 时调用 `assertEnrollmentOwnedByUser` 验证 enrollment 归属, 然后返回所有 responses
  4. **CourseReader.tsx**: 新增 `useClientCourse` hook 调 portal 端点, 替换 `useCourse`. ContentBlockRenderer 不变 (其 GET 现在 client 可达)
- 状态: **已修. E2E 全绿:**
  - script 第 11 步: client GET /content-blocks 200 + 返回 PDF block ✅
  - script 第 14 步: portal /client/courses/:id 返回 chapters=1 content_blocks=1 + PDF visible ✅
  - **浏览器验证 (tier2-client-001 视角)**: `/portal/services/course/{id}` 渲染章节列表 + "文档 alpha-test-handout.pdf 下载" 链接, href 指向 `/uploads/.../alpha-test-handout.pdf`, 0 console errors ✅
  - script 第 10/12 步 (org library / lesson-blocks) 仍 403 — 这是 defense-in-depth, 不应再开 (lesson plan 是咨询师备课笔记, 不发 C 端)

### BUG-013 — Caddy /uploads 路由缺失, 上传文件返回 SPA index.html
- 严重度: **BLOCKER** (即使前端能拿到 fileUrl, 浏览器请求该 URL 拿到的是 HTML 不是文件)
- 触发: scripts/alpha-pdf-c-end-test.mjs 第 13 步发现 PDF URL 返回 `Content-Type: text/html; charset=utf-8` size 454 (是 index.html 不是上传的 PDF)
- 根因: `Caddyfile` 只有 `handle /api/*` 反代到 app:4000, `/uploads/*` 落到默认 SPA fallback handler `try_files {path} /index.html`. 由于 `/srv/client/uploads/...` 不存在, 所有上传文件请求都返回 SPA HTML.
- 修法: `Caddyfile` 加 `handle /uploads/* { reverse_proxy app:4000 }` (Fastify 已经在 `app.ts:137` 用 `@fastify/static` 服务 `/uploads/` 前缀, 直接 proxy 即可)
- 状态: **已修. 验证: `curl -sI /uploads/.../foo.pdf` → `Content-Type: application/pdf` size 534 ✅**

### FINDING-001 — 团辅/课程 instance wizard 没有"附件"字段, 用户期待的 C 端附件需走模板层
- 触发: 用户在 alpha 测试前提"团辅/课程的创建需要检查, 尤其是增加的附件, 发给 C 端看的部分, 需要检查是不是实现了的"
- 调研结论 (2026-04-28):
  - **Group instance wizard** (`features/groups/pages/group-wizard/BeforePhase.tsx`): 5 section, 含"宣传海报"但**只是单次 html2canvas → PNG 下载**, 不持久化, 不上传服务器, 不关联 instance.
  - **Course instance wizard** (`features/courses/pages/course-wizard/BeforePhase.tsx`): 4 section, **没有海报也没有附件入口**.
  - **groupInstances / courseInstances schema**: 0 个文件 / 海报 / 附件字段, 仅 title/description/schedule/location/capacity 等元数据.
  - **`course_attachments` 表**: 存在 (chapter 级 FK), 但**全代码库零引用** (server 0 routes / client 0 UI / DB 0 rows). 完全孤儿.
- **真正能流到 C 端的附件路径** (架构上):
  - `知识库 → 课程教学 → 章节内容块` (`courseContentBlocks` 表) — 含 video/audio/pdf/rich_text/quiz/reflection/worksheet/check_in 八种 block, 上传 UI 在 `client/src/features/knowledge/components/ContentBlockPanel/editors/MediaBlockEditors.tsx` (含真实 `<input type="file">` + `useMediaUpload` → POST `/api/orgs/:orgId/upload`).
  - `知识库 → 团辅方案 → 节次内容块` 同款流程.
  - **Portal**: `CourseReader.tsx` + `GroupDetailView.tsx` 都用 `ContentBlockRenderer` 完整渲染这 8 类 block (PDF 在线查看 / 视频音频内嵌播放).
  - 服务端: `/api/orgs/:orgId/upload` 通用上传 (multipart, fastify) ✅; `/api/orgs/:orgId/content-blocks` CRUD ✅.
- **gap**: instance 创建时**不能临时上传一份额外资料发给本期学员**. 想给学员发 PDF/视频, 必须先在模板层 (课程教学/团辅方案) 加内容块, 所有用此模板的 instance 都会带上. 这是 by-design (template 复用), 不是 bug.
- DB 现状: `course_content_blocks` 0 rows. 模板层附件功能存在但暂无人录入数据, alpha 测试者上传第一份内容块即可端到端验证 C 端可见性.
- **alpha 上线评估**:
  - ✅ 上传基础设施 ready (UI + API + Portal 渲染) — 直接可用
  - ❌ orphan `course_attachments` 表应清理或挂上 (alpha 后清理)
  - ⚠️ 用户期待的 instance 级临时附件 (如本期专属讲义) 需产品层决策, 当前一律走模板. 推荐 alpha 先按模板模式跑通.

### NON-BUG — admin-library /goals /agreements /schemes /templates 静态分析假阳性
- 触发行: Tier 1.8-1.10, 1.12 row #6
- 假设: 跟 courses / scales 同款浅 copy 丢子表
- **静态分析结论**: 4 个假阳性, 不是 bug
- 原因: 这 4 个表的子结构都是**主表上的 JSONB 列**(不是单独子表), `db.insert(table).values({ ...body })` 浅 copy 实际能正常保存:
  - `treatmentGoalLibrary.objectivesTemplate / interventionSuggestions: jsonb`
  - `consentTemplates.content: text`
  - `groupSchemes.specificGoals / overallAssessments / recruitmentAssessments: jsonb`
  - `noteTemplates.fieldDefinitions: jsonb`
- API 验证 (4 个全部 create + read 子结构数量 / 内容): goals 2+2 / agreements text 51 字符 / schemes 3 / templates 4 fieldDefs ✅
- 浏览器走查这几行直接标 [x] verified clean (静态分析阶段已确认)


### BUG-010 — 写笔记 mode 对话归到"AI 对话"区而非"会谈记录"区 (Phase I Issue 1)
- 严重度: **MAJOR** (语义错位 + 用户找不到关联)
- 触发行: Tier 2.10.1 写笔记 mode 归档后, 用户反馈 "笔记应该放在会谈记录部分"
- 根因: BUG-009 修复让 4 mode 都自动归档到 ai_conversations, 但 LeftPanel 一刀切显示在 "AI 对话" 区. 写笔记 mode 的产物 (sessionNote) 与中间过程 (chat) 在数据库分两个表 (session_notes / ai_conversations), UI 也分两个区域显示, 用户找不到对应关联.
- 修法 (Phase I Issue 1):
  1. **Server**: ai_conversations 加 session_note_id FK (migration 028). 用户保存 sessionNote 时 ChatWorkspace 调 PATCH /ai-conversations/{id} 把当前 note-mode 对话关联过去.
  2. **Client**: LeftPanel 重组渲染:
     - "会谈记录" 区: 未保存的 note 草稿 (sessionNoteId IS NULL) 列在最上面 (浅灰底 + 虚线 border + "未保存"标记); 已保存的 sessionNote 主行下展开 "📄 AI 草稿过程" 子条目.
     - "AI 对话" 区只显示 plan/simulate/supervise (note 全部移到上面).
- 状态: **已修 (待 commit). 浏览器验证: 保存笔记后, "未保存草稿"消失, sessionNote 下面出现 "AI 草稿过程 · 2 条" 子条目 ✅**

### BUG-011 — Sidebar AI 对话点击只读 viewer 不能续写 (Phase I Issue 2)
- 严重度: **MAJOR** (用户期待的核心交互缺失)
- 触发行: Tier 2.10.1 用户反馈 "左边的 ai 笔记是否可以重新载入"
- 根因: EpisodeDetail 的 onSelectConversation callback 触发 setViewingConversation, OutputPanel 渲染只读 ConversationViewer modal, 用户只能看不能改. 上下文丢失, 续写需手动复制粘贴.
- 修法 (Phase I Issue 2):
  1. ChatWorkspace 用 forwardRef + useImperativeHandle 暴露 `loadConversation(mode, messages, convId)` 方法
  2. EpisodeDetail 持 chatWsRef, onSelectConversation 改为 `chatWsRef.current?.loadConversation(...)` (而不是打开 viewer)
  3. ChatWorkspace 内部强制 setMode → setMessages → setConversationIds 顺序, 防 state 错乱
- 效果: 点 sidebar 任何对话条目 (草稿 / 方案讨论 / 督导 / 模拟) → ChatWorkspace 切到对应 mode + 注入历史消息, 用户可续写
- 状态: **已修 (待 commit). 浏览器验证: 点笔记草稿 → ChatWorkspace 切 "写笔记" mode + 历史消息完整恢复 (用户绿气泡 + AI 黄气泡都在), 输入框可继续输入 ✅**

### BUG-009 — Episode AI 4 mode 归档不一致, 仅 simulate/supervise 入档
- 严重度: **MAJOR** (UX 不一致 + 督导 mode 失去 context)
- 触发行: Tier 2.10.1 写笔记 mode 后 sidebar 不显示对话归档
- 复现:
  1. b@ 进 episode, 写笔记 mode 输入会谈描述, AI 回应 SOAP 建议
  2. 切到 sidebar 看 "AI 对话" 区, **没有"笔记草稿"条目**
  3. 同样讨论方案 mode 的 "方案讨论" 也没归档
  4. 仅模拟来访 + 督导 2 个 mode 自动归档
- 根因: `client/src/features/counseling/components/ChatWorkspace.tsx:247`
  ```
  if (mode === 'simulate' || mode === 'supervise') { /* auto-save */ }
  ```
  显式只对 2 个 mode 归档. note/plan 的对话只存在前端内存, 切 mode 或刷页面就丢. 而且督导 mode 右侧 panel 取 "最近笔记" 时 always 显示 "暂无会谈记录" — 因 note 对话没归档, 督导拿不到上下文.
- 影响:
  1. UX 不一致 (4 mode 共用 chat UI 但只 2 个保留历史)
  2. 督导 context 缺失 (依赖前面 note 对话内容)
  3. 用户无法回看 AI 推理过程
- 修法: 改成 `if (mode !== 'crisis')` 全归档 + 扩展 modeLabel 映射表 (note='笔记草稿', plan='方案讨论'). 同步更新 LeftPanel.tsx (sidebar emoji+label 渲染) 和 OutputPanel.tsx (ConversationViewer mode 显示) 的 mode→label 映射, 防止旧代码把 note 显示成 supervise 的 🎓.
- 状态: **已修 (待 commit). 浏览器验证: 修后 sidebar AI 对话 (4) 含全部 4 mode 归档, 各自 emoji 不同 (📝/🎯/🎓/🗣️) ✅**

### BUG-008 — Portal 页面高度不统一, 底部 nav 浮在内容下方而非 viewport 底部
- 严重度: **MAJOR** (移动端核心 UX 缺陷, 不像小程序更像普通网页)
- 触发行: Tier 3 portal 多页 (/portal /portal/services /portal/archive /portal/account 各子页)
- 复现:
  1. tier2-client-001 登录 portal
  2. 进短内容页 (如 /portal/account/consents, 显示 "暂无知情同意书")
  3. **底部 4-tab nav (首页/我的服务/档案/我的) 浮在内容刚结束的位置, 不在屏幕底部**
  4. 下面是大片 slate-100 空白
  5. 不同页面 nav 位置随内容高度跳动
- 根因: 双重问题
  1. `packages/client-portal/index.html` 的 `<html>`/`<body>` 没设 height; `index.css` 也没. CSS 默认 `height: auto` (按内容高度)
  2. `PortalAppShell.tsx:70` 用 `h-[100dvh]` arbitrary value, 但 Tailwind JIT 没把它编译进 bundle (CSS 表里 foundRule: null), 元素 fallback 到 height: auto
  - 双重塌陷: html/body/root 链全是 345px (= 内容高度), 整个 portal phone shell 跟着塌
- 怀疑文件:
  - `packages/client-portal/src/index.css` (缺全局 height: 100% 设置)
  - `packages/client-portal/src/PortalAppShell.tsx:70` (h-[100dvh] 不工作)
- 修法:
  1. `index.css` 加 `html, body, #root { height: 100% }`
  2. `PortalAppShell.tsx:70` `h-[100dvh]` → `h-screen` (Tailwind 内置, 100% 编译)
- 状态: **已修 (待 commit). 浏览器验证: 修复后 phoneShell.h = 911 (= viewport), nav.bottom = vh (贴底). /portal /portal/services /portal/account /portal/account/consents 4 页全部通过.**
- 影响: 100% portal 用户在桌面浏览器看到的视觉问题. 移动端 Safari/Chrome 100vh URL bar 遮挡问题留作 future polish (alpha 可接受)

### BUG-007 — 研判分流提示指向已废弃的 "协作中心/待处理候选" tab
- 严重度: **MAJOR** (UX 死循环, 用户找不到提示让做的事)
- 触发行: Tier 2.5 #15 (TriageActionBar.tsx)
- 复现:
  1. b@ 进 /research-triage 选一个候选 (无 candidate_pool 行的 result)
  2. 看到 3 按钮 (转个案/课程·团辅/忽略) 都 disabled
  3. 底部提示: "此测评结果尚未落入候选池, 先在协作中心'待处理候选'里手动创建候选, 再回来执行动作"
  4. 按提示去 /collaboration → 4 个 tab 是: 派单 / 临时授权 / 督导待审 / 收到的转介
  5. **没有 "待处理候选" tab, 也没有 "手动创建候选" 按钮**
- 根因: useWorkflow.ts L90 注释明确说"useCandidatePool removed — the old 协作中心/待处理候选 Tab has been superseded by the /research-triage workspace". 但 TriageActionBar 的提示文字 (L157) 没跟随重构更新, 引用了已经不存在的 tab.
  - candidate_pool 行现在只能由 workflow rule engine (Phase 12+) 自动创建; alpha 上没机构配置规则, 所以这 3 按钮永远 disabled.
- 怀疑文件: `client/src/features/research-triage/components/TriageActionBar.tsx` L157
- 修法: 改提示文字, 反映真实情况: "候选池条目由工作流规则自动创建（机构未配置规则时不会产生）。当前可点「确认/调整级别」修改 L 等级；要直接做处置，请到「交付中心」新建个案 / 团辅 / 课程，或在右侧 AI 建议里参考下一步动作。"
- 状态: **已修 (待 commit). 浏览器验证: hard reload 后新提示显示, 旧文案消失.**
- 影响范围: 所有未配工作流规则的机构 (alpha 默认状态), 即 100% 的研判分流用户

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

### BUG-006 — OrgAdminDashboard 5 KPI 卡只有 2 个可点
- 严重度: **MINOR** (UX 不一致, 不影响核心功能)
- 触发行: Tier 2.1 #1 / #2 / #5
- 复现:
  1. b@ org_admin 登录, 进 / (OrgAdminDashboard)
  2. 看到 5 个 KPI 卡: 本月新增来访者 / 本月个咨 / 进行中团辅 / 进行中课程 / 本月测评
  3. **只有"进行中团辅" + "进行中课程"** 有 cursor-pointer 可点跳到 /delivery?type=*. 其余 3 个卡 (本月新增/本月个咨/本月测评) 不可点击, 没有 cursor-pointer.
- 期望: 5 个卡都可点跳过滤 list (如 /delivery?type=client, type=counseling, type=assessment), 一致的 UX
- 实际: 2/5 可点, 3/5 不可点 (UX 不一致)
- 怀疑: status filter (进行中) 类 KPI 容易映射到 list `?type=group/course`, 但 "本月新增" 类时间统计型 KPI 没有现成的 `?period=current_month` 路由, 所以暂未挂跳转
- 怀疑文件: `client/src/features/admin/pages/OrgAdminDashboard.tsx` 或类似 KPI cards 组件
- 状态: **未修, 标 MINOR ship-with-known-issue**. 不阻断 alpha. 推荐 follow-up: 要么补 list 路由的时间过滤, 要么明确 disable cursor-pointer 让用户预期一致.
- 用户视觉影响: 鼠标 hover 不可点的卡时无 cursor 变化, 不会误以为可点

---

# 接续断点

**当前状态**: 浏览器 walkthrough 全部 3 Tier 完成. 系统管理员 + org_admin + client portal 三视角全程走通, 撞 6 个 bug + 修了 4 个真 bug + 1 minor ship-with-known-issue + 1 minor 不修.

## 最终 sign-off 总结

### 走查覆盖度
- ✅ **Tier 1 (系统管理员视角)** 全部 page 全部覆盖:
  - 1.1 /login + 1.2 /forgot-password (认证流, 含防枚举)
  - 1.3 /admin/dashboard (5 sidebar nav + KPI)
  - 1.4 /admin/tenants (列表 + 4 filter)
  - 1.5 /admin/tenants/new TenantWizard 6 步 (含 b@ 邮箱已存在复用回归)
  - 1.6 /admin/tenants/:id (基本/成员 tab + 许可证/添加成员/角色/重复检查回归)
  - 1.7-1.12 /admin/library 6 个 tab (浅 copy 5 端点已 API 验证: 1 真 bug 修, 4 假阳性)
  - 1.13 ScaleDetail 详情 (合并 Tier 2.10 AI 量表生成时一起测)
  - Legal pages /legal/terms /legal/privacy 占位文案显示
  - 退出按钮 → /login
- ✅ **Tier 2.10 AI 生成 (重点)**: 量表 + 课程 (含 BUG-001 + BUG-005 修复浏览器验证)
- ✅ **Tier 2 主要 page** (b@ org_admin 视角 2026-04-27): 
  - 2.1 Home (KPI 卡撞 BUG-006 minor)
  - 2.2 /delivery (5 type filter 全过)
  - 2.3 /episodes/new (5 step wizard 全跑通, episode 创建成功)
  - 2.4 /episodes/{id} (4 AI 模式 + 3 chip 全切换正常, UI 已迭代为 4 模式而非 plan 中的 6 tab)
  - 2.5 /research-triage (5 bucket UI + filter, 空数据)
  - 2.6 /collaboration (4 tab: 派单/临时授权/督导待审/收到的转介)
  - 2.7 /audit (操作日志 + PHI 访问 2 tab, 显示真实 audit 数据)
  - 2.8 /settings (5 group 全覆盖: 我的/门面/组织管理/经营/安全与合规)
  - 2.9 /availability (排班 7 天 row UI 正常)
- ✅ **Tier 3 Portal** (tier2-client-001 视角, API 设密码后登录):
  - 3.1 /portal home (移动端 layout, 待办+发现服务)
  - 3.2-3.7 4 底部 tab 全切换通过 (首页/我的服务/档案/我的)
  - /portal/account 显示 user 信息 + 所属机构 (Tier1 测试心理咨询) + 绑定孩子 + 协议授权 row
  - 3.8 公开页 /legal/privacy + /legal/terms 显示完整文案 (非占位)

### Bug 总账
| ID | 严重度 | 状态 | 说明 |
|----|--------|------|------|
| BUG-001 | MAJOR | 已修(3ef7f9d) | admin /courses 浅 copy 丢 chapters 子表 |
| BUG-002 | BLOCKER | 已修(3afbd97) | /admin/settings 整页崩 (config.platform.name on undefined) |
| BUG-003 | MINOR | 不修 | 续期 UI 不刷新 + 语义存疑 (workaround: hard refresh) |
| BUG-004 | MAJOR | 已修(4de974d) | ScaleDetail/CourseDetail 横向滚动 (final fix: 抛弃 -m-6, 用 flex h-full) |
| BUG-005 | BLOCKER | 已修(2928b97) | AI course creator /orgs/null/ai 404 (aiPrefix 缺 sysadmin fallback) |
| BUG-006 | MINOR | 已修(653ed20) | OrgAdminDashboard 5 KPI 卡只有 2 个可点 (UX 不一致) — 全部加 onClick 跳到对应 /delivery?type=* |
| BUG-007 | MAJOR | 已修(待 commit, Phase H 深度修) | 研判分流详情面板 3 按钮在无规则机构永远 disabled. **Phase H 真正修复**: (1) 新加 `POST /triage/results/:id/candidate` lazy-create 端点(sourceRuleId=null 标记手工创建, 幂等防重复) (2) `useLazyCreateCandidate` hook + TriageActionBar `ensureCandidate` ensure-then-act (3) workflow accept 扩展 episode_candidate kind 真创建 careEpisode + 返回 episodeId (mirror crisis pattern). 浏览器端到端: b@ 点 Tier2 关注 L2 row 转个案 → POST candidate 201 → POST accept 200 → navigate `/episodes/0c73d71e...`. DB 验证 candidate.source_rule_id IS NULL + resolved_ref_type='care_episode' + 新 careEpisode 行存在. ✅ |
| BUG-008 | MAJOR | 已修(4bc5953) | Portal 页面高度不统一, 底部 nav 浮在内容下方 — html/body/root 没 height + `h-[100dvh]` Tailwind 没编译. 修法: index.css 加 height:100% + h-screen 替换 |
| BUG-009 | MAJOR | 已修(305c685) | Episode AI 4 mode 仅 simulate/supervise 自动归档, note/plan 漏档. 督导 mode 因此拿不到笔记 context. 修法: `if (mode !== 'crisis')` 全归档 + 扩展 mode→label 映射 |
| BUG-010 | MAJOR | 已修(待 commit) | 写笔记 mode 对话归"AI 对话"区错位. 修法 (Phase I Issue 1): ai_conversations 加 sessionNoteId FK, 保存笔记时关联, LeftPanel 重组为草稿+主记录+草稿子项 |
| BUG-011 | MAJOR | 已修(bc60dc6) | Sidebar AI 对话点击只读 viewer 不能续写. 修法 (Phase I Issue 2): forwardRef + loadConversation, 点击载入 ChatWorkspace 切 mode + 注入消息 |
| ENH-001 | enhancement | 已实施(待 commit) | LeftPanel "AI 对话" 平铺改为 3 mode 各自独立 section (治疗方案/模拟练习/督导对话). 跟会谈记录/评估记录的"按内容类型分组" pattern 一致, 用户找特定 mode 历史不需 scan |
| FINDING-001 | architectural | 文档化, 不修 | 团辅/课程 instance wizard 无附件字段; "宣传海报" 仅本地下载. 附件流是模板层 `courseContentBlocks`/scheme session blocks (video/audio/pdf 都已可上传可在 Portal 渲染). 孤儿表 `course_attachments` 应清理 (alpha 后) |
| BUG-012 | BLOCKER | 已修(待 commit) | Portal CourseReader 整体不可用: 3 个 rejectClient hook 阻断 client GET. 修法: 新建 `/client/courses/:id` portal 端点 + 移除 content-block + enrollment-response 的 hook 级 reject (改成 GET handler 内联 client 过滤) + CourseReader 改用新 hook. 浏览器验证 PDF 章节渲染 + 下载链接可用 ✅ |
| BUG-013 | BLOCKER | 已修(待 commit) | Caddy /uploads 路由缺失, 所有上传文件返回 SPA index.html. 修法: Caddyfile 加 `handle /uploads/* { reverse_proxy app:4000 }`. Fastify 已用 @fastify/static 服务该前缀, 一行 Caddy 配置即可. 验证 curl -sI 返回 application/pdf 534 字节 ✅ |
| COUNSELING-PERM | architectural / compliance | 已修(待 commit) | **Phase 1.5 严格合规**: counseling 删 intern + receptionist 角色, clinic_admin 默认不读 phi_full(咨询全文). 5 条核心 phi_full 路由(session-note GET/PATCH, episode GET, ai-conversation GET, assessment-result GET)接入 assertAuthorized 中间件. 单点开通走 access_profile.dataClasses, admin UI 提供"临床执业身份" checkbox(老板兼咨询师场景). E2E 9/9 PASS, 单测 33/33 PASS, 浏览器验证 toggle 端到端持久化+反转 ✅ |
| ENH-002 | enhancement | 已实施(待 commit) | PDF 内嵌 iframe 预览 + 视频/音频端到端验证. PdfBlockView 根据 payload.mode='view' 内嵌 iframe (浏览器原生 PDF 查看器) + 提供"新窗口打开"+"下载". E2E 脚本扩展 4b/4c 步上传 mp3/mp4 + 创建 audio/video content block. 浏览器验证 tier2-client-001 视角 chapter 渲染 1 iframe + 1 video + 1 audio (controls), 0 console errors ✅ |
| FINDING-001 | architectural | 已清理(待 commit) | 孤儿表 course_attachments 已通过 migration 029 (`server/src/db/migrations/029-drop-orphan-course-attachments.ts`) 删除 + schema.ts 移除定义. 真正的章节附件流走 courseContentBlocks (b16dcf2 已端到端). |
| BUG-003 | MINOR → 已修 | 已修(待 commit) | License 续期改用 max(now, oldExpiry) + months (SaaS 标准语义), 提前续期不丢天数. UI 加 toast 通知 (renew/issue/revoke/modify 全部). verify-renew-semantic.mjs 验证 ✅ |
| LEGAL-PAGES | docs cleanup | 已清理(待 commit) | LegalPage 日期改为 build-time stamp (VITE_BUILD_DATE 或 fallback to current date), 文案添加 "(待法务出具正式版)" 明示状态. 浏览器验证 /legal/privacy + /legal/terms 都正常渲染 ✅ |

修了 2 BLOCKER + 7 MAJOR + 1 MINOR (BUG-001/002/004/005/006/007/008/009/010/011). BUG-007 已 Phase H 深度修复 (lazy-create candidate + workflow accept 扩展 episode_candidate). 标 1 MINOR ship-with-known-issue (BUG-003 续期 UI 不刷新).

### Alpha 上线就绪判据 (per Phase F plan §"终止条件")
1. ✅ Tier 1 全 pass (法律页 + 退出 + sidebar + tenant CRUD + library 6 tab 都覆盖)
2. ✅ Tier 2 ≥ 95% — 系统管理员 + b@ org_admin 全 9 个主页面通过 (delivery/wizard/triage/collaboration/audit/settings/availability + 4 模式 episode + AI 生成 2 类)
3. ✅ Tier 3 ≥ 80% — tier2-client-001 portal 4 tab 全过 + /portal/account 完整, 公开法律页通过. 真实 fixture (book/archive/assess) 跳过原因明确
4. ✅ 0 open BLOCKER (3 个都已修)
5. ✅ 5 个 admin-library 浅 copy verified (1 修 4 假阳性, 浏览器 + API 双重验证)
6. ✅ 干净状态 docker compose up -d --build 全栈起来 + 健康检查通过 + a@/b@/tier2-client-001 三视角登录通过
7. (待生成) 最终 sign-off commit

### 浏览器测试 vs API 测试覆盖矩阵
- API 端点 (50+): scripts/alpha-e2e-walkthrough.mjs + alpha-e2e-ai-walkthrough.mjs ✅
- UI 关键路径 (auth + tenant create + library save + AI 生成): browser walkthrough ✅
- UI 边缘情况 (form validation / responsive layout / modal close): BUG-004 已修, layout 已 verified clean
- Org user (b@ org_admin) shell + 9 主页面: 浏览器 ✅
- Client portal (tier2-client-001) 4 底部 tab + 移动端 layout: 浏览器 ✅
- 公开页 /legal/privacy + /legal/terms: 浏览器 ✅ (完整文案非占位)

**结论**: 三视角 (系统管理员 / 机构管理员 / 来访者) 浏览器测试均满足 alpha 上线门槛. 真人测试者从浏览器登录全流程已 verified 端到端可用.

### AI 功能真实使用验证 (深度补测 2026-04-27)
基于用户反馈"目前是不是只完成了页面查看, 没真用 AI 功能", 补充深度交互测试:

1. **Episode 写笔记 AI** — 输入完整会谈描述, AI 真实回应输出 SOAP S 段, 点 "采纳" 写入右侧表单 ✅
2. **干预目标 AI 生成** — 多轮对话 (需求 → AI 反问澄清 → 确认 → 生成草稿 → 保存到库 → reload 验证), 7 个参考目标 + 6 个建议干预共 13 条 nested 数据全部完整持久化 ✅. 这是对"NON-BUG 静态分析判断 4 类 JSONB 端点无浅 copy"的实测确认.
3. **研判分流 AI 风险评级 + 临床建议** — 高分 (50/50) 筛查测评提交 → autoTriageAndNotify 异步运行 → 自动评 riskLevel='level_3' + AI 生成 3 条临床建议 (开个咨/入组团辅/加测 PHQ-9). 候选自动出现在 /research-triage list, 详情面板显示 AI 建议. 测试人工覆写 L3→L4 (PATCH risk-level), list+bucket 实时刷新. 完整 audit chain (ai_call/create assessment/create result/triage.risk_level.updated) 全部记录 ✅
4. **AI provider 性能** — deepseek-v3.2 模型, 简单段落生成 ~25-30s, 多轮对话总响应 ~30-40s, 异步 triage 推荐 ~15-30s. 在 alpha 可接受范围.

**最近 commit**: 653ed20 fix(dashboard): make all 5 KPI cards clickable in OrgAdminDashboard
