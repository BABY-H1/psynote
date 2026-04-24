-- 角色与权限架构重构 Phase 1 骨架 — 数据模型扩展
--
-- 背景:现有 3 角色(org_admin/counselor/client)在学校/企业场景露底,
-- 无法表达班主任、分管领导、家长、学生、HR、EAP 顾问等主体。新架构
-- 用 per-orgType 角色字典 + Principal 类型 + PHI 数据密级组成三维
-- 权限模型(详见 docs/architecture/role-authorization.md)。
--
-- 本迁移只做"骨架":加列、加表、加约束 —— 不迁数据、不改任何路由行为。
-- Phase 2 的 backfill 脚本负责把现有 (orgType, role) 推入新列。
--
-- 所有新列都 nullable,零锁表风险。index 留给 Phase 2 backfill 完再加。

-- ─── 1. org_members: role_v2 / principal_class / access_profile ───

ALTER TABLE "org_members"
  ADD COLUMN IF NOT EXISTS "role_v2" text;

ALTER TABLE "org_members"
  ADD COLUMN IF NOT EXISTS "principal_class" text;

ALTER TABLE "org_members"
  ADD COLUMN IF NOT EXISTS "access_profile" jsonb;

-- principal_class 允许值硬约束(枚举级,与 orgType 无关)
ALTER TABLE "org_members"
  DROP CONSTRAINT IF EXISTS "ck_org_members_principal_class";
ALTER TABLE "org_members"
  ADD CONSTRAINT "ck_org_members_principal_class"
  CHECK ("principal_class" IS NULL
      OR "principal_class" IN ('staff', 'subject', 'proxy'));

-- role_v2 × orgType 合法性 —— 用 trigger 校验(CHECK 不能跨表查)
CREATE OR REPLACE FUNCTION fn_validate_role_v2_vs_org_type()
RETURNS trigger AS $$
DECLARE
  v_org_type text;
  v_allowed text[];
BEGIN
  IF NEW.role_v2 IS NULL THEN
    RETURN NEW; -- nullable during Phase 1
  END IF;

  SELECT COALESCE(settings->>'orgType', 'counseling')
    INTO v_org_type
    FROM organizations
   WHERE id = NEW.org_id;

  v_allowed := CASE v_org_type
    WHEN 'school' THEN ARRAY[
      'school_admin','school_leader','psychologist',
      'homeroom_teacher','student','parent'
    ]
    WHEN 'counseling' THEN ARRAY[
      'clinic_admin','supervisor','counselor',
      'intern','receptionist','client'
    ]
    WHEN 'enterprise' THEN ARRAY[
      'hr_admin','eap_consultant','employee'
    ]
    WHEN 'solo' THEN ARRAY['owner','client']
    WHEN 'hospital' THEN ARRAY[
      'hospital_admin','attending','resident',
      'nurse','patient','family'
    ]
    ELSE ARRAY[]::text[]
  END;

  IF NOT (NEW.role_v2 = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'role_v2=% 不是 orgType=% 的合法角色',
      NEW.role_v2, v_org_type;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_role_v2 ON "org_members";
CREATE TRIGGER trg_validate_role_v2
  BEFORE INSERT OR UPDATE OF role_v2 ON "org_members"
  FOR EACH ROW
  EXECUTE FUNCTION fn_validate_role_v2_vs_org_type();

-- ─── 2. phi_access_logs: data_class / actor_role_snapshot ──────

ALTER TABLE "phi_access_logs"
  ADD COLUMN IF NOT EXISTS "data_class" text;

ALTER TABLE "phi_access_logs"
  ADD COLUMN IF NOT EXISTS "actor_role_snapshot" text;

-- data_class 枚举硬约束
ALTER TABLE "phi_access_logs"
  DROP CONSTRAINT IF EXISTS "ck_phi_access_logs_data_class";
ALTER TABLE "phi_access_logs"
  ADD CONSTRAINT "ck_phi_access_logs_data_class"
  CHECK ("data_class" IS NULL OR "data_class" IN (
    'phi_full','phi_summary','de_identified',
    'aggregate','self_only','guardian_scope'
  ));

-- ─── 3. user_role_audit ────────────────────────────────────────
-- 每次 role_v2 / access_profile / principal_class 变更都记一行。
-- 既有 audit_logs 表不够用(无 role 字段快照),独立表方便按角色演变审计。

CREATE TABLE IF NOT EXISTS "user_role_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "action" text NOT NULL,
    -- 'role_change' | 'access_profile_change' | 'principal_class_change'
  "role_before" text,
  "role_after" text,
  "access_profile_before" jsonb,
  "access_profile_after" jsonb,
  "actor_id" uuid REFERENCES "users"("id"),
  "actor_role_snapshot" text,
  "reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_user_role_audit_org_user"
  ON "user_role_audit"("org_id", "user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_user_role_audit_actor"
  ON "user_role_audit"("actor_id", "created_at" DESC);
