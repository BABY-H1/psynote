-- 候选池按目标服务分拆 — candidate_pool 新增 target_* 字段
--
-- 背景:workflow 规则可能产生 group_candidate / course_candidate,意图是把
-- 来访者加入某个具体的团辅/课程实例。此前只有文本 `suggestion` 暗示,没
-- 有结构化的外键,导致团辅/课程详情页无法反查"指向本服务的候选名单"。
--
-- 新增两列 + 两条索引,支撑 GroupInstanceDetail / CourseInstanceDetail 的
-- 候选 tab。现存行保持 NULL — 规则引擎下一次写入时会填充。
--
-- 相关文件:
--   server/src/modules/workflow/rule-engine.service.ts (createCandidate)
--   client/src/features/groups/components/GroupInstanceDetail.tsx
--   client/src/features/courses/components/CourseInstanceDetail.tsx

ALTER TABLE "candidate_pool"
  ADD COLUMN IF NOT EXISTS "target_group_instance_id" uuid
    REFERENCES "group_instances"("id") ON DELETE SET NULL;

ALTER TABLE "candidate_pool"
  ADD COLUMN IF NOT EXISTS "target_course_instance_id" uuid
    REFERENCES "course_instances"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_candidate_pool_target_group"
  ON "candidate_pool"("target_group_instance_id", "status");

CREATE INDEX IF NOT EXISTS "idx_candidate_pool_target_course"
  ON "candidate_pool"("target_course_instance_id", "status");
