/**
 * One-shot seed: inserts one platform-level row per library resource
 * (orgId IS NULL) so the system administrator's shared knowledge-base UI
 * has something to render during manual verification.
 *
 * Platform identity is signaled by the "平台" badge on the card (which
 * reads from `org_id IS NULL`). Titles deliberately do NOT carry a
 * "[平台] " prefix — it would duplicate the badge visually.
 */
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:psynote123@localhost:5432/psynote');

async function main() {
  await sql`INSERT INTO scales (title, description, scoring_mode, is_public) VALUES ('PHQ-9 抑郁筛查', '平台示例量表', 'sum', true) ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO treatment_goal_library (title, description, problem_area, category, visibility, objectives_template, intervention_suggestions)
            VALUES ('改善社交焦虑', '平台示例目标', 'anxiety', 'short_term', 'public', '[]'::jsonb, '[]'::jsonb) ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO consent_templates (title, consent_type, content, visibility) VALUES ('咨询知情同意书', 'treatment', '示例内容：本同意书用于明确咨询关系…', 'public') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO group_schemes (title, description, theory, target_audience, overall_goal, visibility) VALUES ('正念减压八周', '平台示例团辅方案', 'MBSR', '成人', '缓解压力与焦虑', 'public') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO courses (title, description, course_type, target_audience, status, is_template, is_public) VALUES ('家长沟通微课', '平台示例课程模板', 'micro_course', 'parent', 'published', true, true) ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO note_templates (title, format, field_definitions, visibility) VALUES ('SOAP 会谈记录', 'soap', '[{"key":"s","label":"主诉"},{"key":"o","label":"观察"},{"key":"a","label":"评估"},{"key":"p","label":"计划"}]'::jsonb, 'public') ON CONFLICT DO NOTHING`;

  // Clean up any legacy rows from an earlier run of this seed that baked
  // "[平台] " into the title. Idempotent — no-op on already-cleaned rows.
  await sql`UPDATE scales                 SET title = REPLACE(title, '[平台] ', '') WHERE title LIKE '[平台] %' AND org_id IS NULL`;
  await sql`UPDATE treatment_goal_library SET title = REPLACE(title, '[平台] ', '') WHERE title LIKE '[平台] %' AND org_id IS NULL`;
  await sql`UPDATE consent_templates      SET title = REPLACE(title, '[平台] ', '') WHERE title LIKE '[平台] %' AND org_id IS NULL`;
  await sql`UPDATE group_schemes          SET title = REPLACE(title, '[平台] ', '') WHERE title LIKE '[平台] %' AND org_id IS NULL`;
  await sql`UPDATE courses                SET title = REPLACE(title, '[平台] ', '') WHERE title LIKE '[平台] %' AND org_id IS NULL`;
  await sql`UPDATE note_templates         SET title = REPLACE(title, '[平台] ', '') WHERE title LIKE '[平台] %' AND org_id IS NULL`;

  console.log('Seeded 6 platform-level library items + stripped any legacy [平台] title prefixes');
  await sql.end();
}
main();
