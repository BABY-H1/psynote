# 角色与授权架构（Role & Authorization Architecture）

> Phase 1 骨架（migration 026）—— 2026-04 写入，后续 phase 逐步落地。

## 为什么重构

历史 3 角色（`org_admin` / `counselor` / `client`）+ `fullPracticeAccess` flag 在小型咨询中心场景勉强够用，但在学校、企业 EAP、医院等多元 orgType 立刻露底：学校光主体就 5 种（学生、家长、班主任、心理老师、分管领导），企业 HR 合规要求只看聚合，前台接待要看预约不碰临床。再加上心理行业数据敏感，**"数据范围 (scope)"之外还必须有"数据密级 (classification)"**——临床全文/摘要/去标识化/聚合/监护范围/自视角，不同角色能触达的密级边界必须声明清晰、可审计。

## 三维模型

```
授权 = f(角色 per orgType, 资源/动作, PHI 数据密级)
```

叠在三维之外的还有两个正交维度：

- **Principal**（`staff` / `subject` / `proxy`）—— 决定登录入口形态
- **Scope** —— assigned/supervised/self/guardian 等具体作用域

## 1. Per-orgType 角色字典

见 [packages/shared/src/auth/roles.ts](../../packages/shared/src/auth/roles.ts)。

| orgType | 角色 |
|---|---|
| school | school_admin · school_leader · psychologist · homeroom_teacher · student · parent |
| counseling | clinic_admin · supervisor · counselor · intern · receptionist · client |
| enterprise | hr_admin · eap_consultant · employee |
| solo | owner · client |
| hospital（占位） | hospital_admin · attending · resident · nurse · patient · family |

DB 层通过 trigger `trg_validate_role_v2` 保证 `role_v2` ∈ orgType 对应集合——跨类型写错会在 INSERT/UPDATE 时被拒绝。

## 2. Principal 类型

| Principal | 说明 | 登录入口 |
|---|---|---|
| staff | 管理者/执业人员 | 主 app |
| subject | 服务对象本人（来访者/学生/员工/患者） | Portal 自视角 |
| proxy | 代理人/监护人（家长/家属） | Portal 监护视角 |

同一 userId 在不同 org 可以是不同 Principal（A 机构的咨询师同时是 B 学校的家长）。

## 3. PHI 数据密级词表

见 [packages/shared/src/auth/data-class.ts](../../packages/shared/src/auth/data-class.ts)。

| Class | 含义 | 典型数据 |
|---|---|---|
| `phi_full` | 原始临床全文 | 咨询逐字稿、病程录、完整测评答卷、AI 对话原文 |
| `phi_summary` | 临床摘要 | 结案报告、督导意见、干预建议摘要 |
| `de_identified` | 去标识化 | 研判分流 bucket 统计、匿名案例教学 |
| `aggregate` | 聚合统计 | EAP 分析、学校年级指标、匿名率 |
| `self_only` | 仅本人 | 自己的测评、预约、心情日记 |
| `guardian_scope` | 监护范围 | 家长可见的孩子数据子集，不含逐字稿 |

`ROLE_DATA_CLASS_POLICY: Record<RoleV2, DataClass[]>` 声明每个角色默认可触达的密级集合。**硬红线**：
- `hr_admin` 只能看 `aggregate`
- `school_leader` 只能看 `aggregate`
- `homeroom_teacher` 只能看 `de_identified` + `aggregate`（不看临床原文）
- `receptionist` 只能看 `aggregate`（预约本走 aggregate）
- `subject` 类只能看 `self_only`
- `proxy` 类只能看 `guardian_scope`

单个成员可通过 `org_members.access_profile.dataClasses: DataClass[]` 做**补丁**（override），但不在 UI 自定义——要改走代码审查。

## 4. 权限决策函数

```ts
authorize(actor, action, resource, scope): Decision
```

见 [packages/shared/src/auth/policy.ts](../../packages/shared/src/auth/policy.ts)。三道检查顺序不可互换：

1. **Role × Action 白名单** —— 角色本身能不能做这动作（`ROLE_ACTION_WHITELIST`）
2. **Data Class 匹配** —— actor 允许的 class 集合包含 resource.dataClass？
3. **Scope 匹配**：
   - `self_only` → 必须 isSelf
   - `guardian_scope` → ownerUserId ∈ scope.guardianOfUserIds
   - `phi_full` / `phi_summary` → ownerUserId ∈ allowedClientIds ∪ supervisedUserIds
   - `de_identified` / `aggregate` → 不做个体匹配

Fail-closed——任一失败 → `allowed=false` + reason。纯函数、无 IO、O(1)。

## 5. 中间件

见 [server/src/middleware/authorize.ts](../../server/src/middleware/authorize.ts)。

```ts
{
  preHandler: [
    authGuard,
    orgContextGuard,
    dataScopeGuard,
    requireAction('sign_off', {
      type: 'crisis_case',
      dataClass: 'phi_full',
      extractOwnerUserId: (r) => (r.params as any).clientId,
    }),
  ],
}
```

Phase 1 **不迁移**任何现有路由。`requireRole` 继续有效。Phase 2 起逐条迁移到 `requireAction`。

## 6. 数据库形状

```
org_members
  role              -- legacy text (保留双读双写期)
  role_v2           -- per-orgType enum via trigger (Phase 2 backfill 填)
  principal_class   -- 'staff' | 'subject' | 'proxy' (CHECK 约束)
  access_profile    -- jsonb { dataClasses?, extraScopes?, grantedAt?, reason? }
  fullPracticeAccess -- 弃用中(Phase 5 drop)
  permissions       -- 保留不启用(V3 自定义矩阵)

phi_access_logs
  + data_class            -- 本次访问的密级
  + actor_role_snapshot   -- 冻结当时角色

user_role_audit (新表)
  id, orgId, userId, action,
  role_before, role_after,
  access_profile_before, access_profile_after,
  actor_id, actor_role_snapshot, reason, created_at
```

## 7. 迁移路径（Expand → Contract）

1. **Phase 1（本次）** —— 加列、加表、加触发器、建 shared lib + 中间件入口。零路由变更。
2. **Phase 2** —— 跑 backfill 脚本（[server/src/scripts/backfill-role-v2.ts](../../server/src/scripts/backfill-role-v2.ts)），前 20 条核心路由迁 `requireAction`，建 shadow mode 对比。
3. **Phase 3** —— authStore / visibility / PortalShell 按 roleV2 + principalClass 渲染；学校新首页（班主任/领导/心理老师视角）；parent portal。
4. **Phase 4** —— 剩下 ~130 条路由迁完；`requireRole` 标 deprecated；legacy role 列只读。
5. **Phase 5** —— drop `fullPracticeAccess` + legacy `role`，rename `role_v2` → `role`。

## 8. 关键不变式（Invariants）

- **Fail-closed**：未知 role / 未知 dataClass / 数据不足 → 一律拒绝
- **System admin bypass**：与 `requireRole` 一致，可在 org-context 全权
- **旧 role 不动**：Phase 1 骨架期间 `role` 列继续正常读写，backfill 未跑不中断任何功能
- **DB CHECK/trigger 是硬红线**：前端/中间件再松，DB 也会拒绝非法 `principal_class` / `role_v2`

## 9. 常见操作参考

**给某成员打"督导"标签**（Phase 3 前的过渡期）：
```sql
UPDATE org_members
   SET role_v2 = 'supervisor',
       principal_class = 'staff'
 WHERE id = :member_id;
-- 旧 role 字段保持 'counselor',兼容老代码路径
```

**给班主任临时放开 phi_summary**（单点补丁）：
```sql
UPDATE org_members
   SET access_profile = jsonb_set(
     COALESCE(access_profile, '{}'::jsonb),
     '{dataClasses}',
     '["de_identified","aggregate","phi_summary"]'::jsonb
   )
 WHERE id = :member_id;
```

## 10. 相关文件

- **Shared lib**：`packages/shared/src/auth/`
- **Migration**：`server/drizzle/0008_role_architecture_skeleton.sql` / `server/src/db/migrations/026-role-architecture-skeleton.ts`
- **Schema**：`server/src/db/schema.ts`（`orgMembers` / `phiAccessLogs` / `userRoleAudit`）
- **Middleware**：`server/src/middleware/authorize.ts` · `server/src/middleware/org-context.ts` · `server/src/middleware/audit.ts`
- **Backfill**：`server/src/scripts/backfill-role-v2.ts`
- **Tests**：`packages/shared/src/auth/__tests__/` · `server/src/middleware/authorize.test.ts` · `server/src/scripts/__tests__/backfill-role-v2.test.ts`
