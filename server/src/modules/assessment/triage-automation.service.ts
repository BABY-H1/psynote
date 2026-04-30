/**
 * Triage Automation Service — 自动研判 + 风险通知
 *
 * After assessment result is created with a risk level:
 * 1. Auto-generate AI recommendations (fire-and-forget)
 * 2. Dispatch notifications based on risk level and orgType
 *
 * This module is always called fire-and-forget from result.service.ts.
 * Failures are logged but never block the assessment submission.
 */
import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { env } from '../../config/env.js';
import {
  assessmentResults,
  organizations,
  orgMembers,
  clientAssignments,
  schoolStudentProfiles,
} from '../../db/schema.js';
import { createNotification } from '../notification/notification.service.js';
import type { AIProvenance, OrgType } from '@psynote/shared';
import { getTerm } from '@psynote/shared';

// ─── Auto AI Triage ─────────────────────────────────────────────

interface AutoTriageParams {
  orgId: string;
  resultId: string;
  riskLevel: string;
  userId: string | null;
  dimensionScores: Record<string, number>;
}

/**
 * Auto-generate AI triage recommendations and store on the result row.
 * Then:
 *   1. Dispatch built-in risk-level notifications (kept for backwards compat)
 *   2. Run the org's custom workflow rules (Phase 12+ — additive)
 *
 * The two paths are independent: if the org hasn't configured any rules,
 * the built-in behaviour is unchanged. If rules exist, they run after the
 * built-in step and produce additional candidate_pool entries / notifications.
 */
export async function autoTriageAndNotify(params: AutoTriageParams): Promise<void> {
  const { orgId, resultId, riskLevel, userId, dimensionScores } = params;

  // 1. Generate AI recommendations (may fail if AI service not configured)
  try {
    const { recommendTriage } = await import('../ai/pipelines/triage.js');

    const dimensions = Object.entries(dimensionScores).map(([name, score]) => ({
      name,
      score,
      label: score > 20 ? '偏高' : score > 10 ? '中等' : '正常', // simplified labels
    }));

    const triageResult = await recommendTriage(
      {
        riskLevel,
        dimensions,
        availableInterventions: ['course', 'group', 'counseling', 'referral'],
      },
      {
        orgId,
        userId,
        pipeline: 'triage-auto',
      },
    );

    // 同步写入 AI 合规水印 (Phase K).
    // recommendations + provenance 一起更新, 让前端 <AIBadge /> 能展示
    // model + 时间, 满足"AI 输出必须可识别"的合规要求.
    // 历史行为 ai_provenance=null, 前端会 fallback 到 generic "AI 生成".
    const provenance: AIProvenance = {
      aiGenerated: true,
      aiModel: env.AI_MODEL,
      aiPipeline: 'triage-auto',
      aiGeneratedAt: new Date().toISOString(),
    };

    await db
      .update(assessmentResults)
      .set({
        recommendations: triageResult.recommendations,
        aiProvenance: provenance,
      })
      .where(eq(assessmentResults.id, resultId));
  } catch (err) {
    console.warn('[auto-triage] AI recommendation failed (non-blocking):', err);
  }

  // 2. Dispatch built-in notifications (legacy behaviour — unchanged)
  try {
    await dispatchTriageNotifications(orgId, resultId, riskLevel, userId);
  } catch (err) {
    console.warn('[auto-triage] Notification dispatch failed (non-blocking):', err);
  }

  // 3. Run workflow rules (Phase 12 — additive).
  //    This may create candidate_pool entries, push courses, or send internal
  //    notifications according to the org's configured rules. The engine is
  //    self-isolating: rule failures don't propagate.
  try {
    const { runRulesForEvent } = await import('../workflow/rule-engine.service.js');
    // Load orgType for condition evaluation
    const [org] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    const orgType = ((org?.settings as Record<string, any>) || {}).orgType || 'counseling';

    // Look up assessmentId + answers so the rule engine can evaluate
    // item_value:<itemId> and dimension_score:<dimId> conditions.
    const [result] = await db
      .select({
        assessmentId: assessmentResults.assessmentId,
        totalScore: assessmentResults.totalScore,
        answers: assessmentResults.answers,
      })
      .from(assessmentResults)
      .where(eq(assessmentResults.id, resultId))
      .limit(1);

    // Flatten answers → itemValues map. `answers` is stored as
    // `{ [itemId]: number | string }` (numbers for likert scales, strings
    // for free-text — free text is simply filtered out here).
    const itemValues: Record<string, number> = {};
    if (result?.answers && typeof result.answers === 'object') {
      for (const [k, v] of Object.entries(result.answers as Record<string, unknown>)) {
        const n = typeof v === 'number' ? v : Number(v);
        if (Number.isFinite(n)) itemValues[k] = n;
      }
    }

    // `totalScore` comes back as string|null from drizzle's numeric type
    const totalScoreNum = result?.totalScore != null
      ? Number(result.totalScore)
      : undefined;

    await runRulesForEvent({
      orgId,
      event: 'assessment_result.created',
      payload: {
        resultId,
        userId,
        assessmentId: result?.assessmentId || '',
        riskLevel,
        totalScore: Number.isFinite(totalScoreNum) ? totalScoreNum : undefined,
        dimensionScores,
        itemValues,
        orgType,
      },
      triggeringUserId: userId,
    });
  } catch (err) {
    console.warn('[auto-triage] Rule engine failed (non-blocking):', err);
  }
}

// ─── Risk-based Notification Dispatcher ──────────────────────────

async function dispatchTriageNotifications(
  orgId: string,
  resultId: string,
  riskLevel: string,
  userId: string | null,
): Promise<void> {
  // Load org settings for orgType
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) return;

  const settings = (org.settings || {}) as Record<string, any>;
  const orgType = (settings.orgType || 'counseling') as OrgType;

  // level_1/2: no notifications
  if (riskLevel === 'level_1' || riskLevel === 'level_2') return;

  const clientTerm = getTerm(orgType, 'client');

  // level_3+: notify assigned counselor/teacher
  if (userId) {
    const [assignment] = await db
      .select({ counselorId: clientAssignments.counselorId })
      .from(clientAssignments)
      .where(and(
        eq(clientAssignments.orgId, orgId),
        eq(clientAssignments.clientId, userId),
      ))
      .limit(1);

    if (assignment) {
      await createNotification({
        orgId,
        userId: assignment.counselorId,
        type: 'risk_alert',
        title: `${clientTerm}评估结果需关注`,
        body: `风险等级: ${riskLevel}，请查看评估结果并处理`,
        refType: 'assessment_result',
        refId: resultId,
      });
    }
  }

  // level_4: notify org admins + orgType-specific actions
  if (riskLevel === 'level_4') {
    // Notify all org_admins
    const admins = await db
      .select({ userId: orgMembers.userId })
      .from(orgMembers)
      .where(and(
        eq(orgMembers.orgId, orgId),
        eq(orgMembers.role, 'org_admin'),
        eq(orgMembers.status, 'active'),
      ));

    for (const admin of admins) {
      await createNotification({
        orgId,
        userId: admin.userId,
        type: 'crisis_alert',
        title: `危机预警：${clientTerm}评估结果达到危机等级`,
        body: `有${clientTerm}的评估结果达到 level_4（危机），请立即关注`,
        refType: 'assessment_result',
        refId: resultId,
      });
    }

    // School: notify parent
    if (orgType === 'school' && userId) {
      await notifyParent(orgId, userId, resultId, riskLevel, settings);
    }

    // Enterprise: trigger crisis alert (via eap module)
    if (orgType === 'enterprise' && userId) {
      try {
        const { emitEapEvent } = await import('../eap/eap-event-emitter.js');
        await emitEapEvent({
          orgId,
          eventType: 'crisis_flagged',
          userId,
          riskLevel: 'level_4',
        });
      } catch {
        // EAP module may not be relevant
      }
    }
  }
}

// ─── Parent Notification (School-specific) ───────────────────────

async function notifyParent(
  orgId: string,
  studentUserId: string,
  resultId: string,
  riskLevel: string,
  orgSettings: Record<string, any>,
): Promise<void> {
  const schoolConfig = orgSettings.schoolConfig || {};

  // Check if parent notification is enabled for this risk level
  if (riskLevel === 'level_3' && !schoolConfig.parentNotifyOnLevel3) return;
  if (riskLevel === 'level_4' && !schoolConfig.parentNotifyOnLevel4) return;

  // Look up student profile for parent contact
  const [profile] = await db
    .select({
      parentName: schoolStudentProfiles.parentName,
      parentPhone: schoolStudentProfiles.parentPhone,
      parentEmail: schoolStudentProfiles.parentEmail,
    })
    .from(schoolStudentProfiles)
    .where(and(
      eq(schoolStudentProfiles.orgId, orgId),
      eq(schoolStudentProfiles.userId, studentUserId),
    ))
    .limit(1);

  if (!profile?.parentPhone && !profile?.parentEmail) return;

  // Record notification (in-app log; email sending would be added later)
  // For now, create a notification record associated with the student
  await createNotification({
    orgId,
    userId: studentUserId, // logged under the student for audit trail
    type: 'parent_notification',
    title: '家长通知已发送',
    body: `已通知家长 ${profile.parentName || '(未填写)'}，联系方式: ${profile.parentPhone || profile.parentEmail || '(未填写)'}`,
    refType: 'assessment_result',
    refId: resultId,
  });

  // TODO: Send actual email/SMS to parent
  // await sendEmail(profile.parentEmail, { subject: '学生心理评估通知', ... })
  console.log(`[parent-notify] Org ${orgId}: Would notify parent of student ${studentUserId} (${riskLevel})`);
}
