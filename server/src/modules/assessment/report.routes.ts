import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as reportService from './report.service.js';
import { generateReportPDF, generateBatchPDFZip } from './pdf.service.js';

export async function reportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard);
  app.addHook('preHandler', orgContextGuard);

  /** List reports */
  app.get('/', async (request) => {
    return reportService.listReports(request.org!.orgId);
  });

  /** Get a single report */
  app.get('/:reportId', async (request) => {
    const { reportId } = request.params as { reportId: string };
    return reportService.getReportById(reportId);
  });

  /** Generate a report */
  app.post('/', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const body = request.body as {
      reportType: string;
      resultId?: string;
      resultIds?: string[];
      assessmentId?: string;
      userId?: string;
      title?: string;
      // Longitudinal (group_longitudinal) — identifies the group/course instance
      // whose PRE/POST assessments are compared across time.
      instanceId?: string;
      instanceType?: 'group' | 'course';
    };

    if (!body.reportType) throw new ValidationError('reportType is required');

    let report;

    switch (body.reportType) {
      case 'individual_single': {
        if (!body.resultId) throw new ValidationError('resultId is required for individual_single');
        report = await reportService.generateIndividualSingleReport({
          orgId: request.org!.orgId,
          resultId: body.resultId,
          generatedBy: request.user!.id,
        });
        break;
      }
      case 'group_single': {
        if (!body.resultIds || body.resultIds.length === 0) {
          throw new ValidationError('resultIds are required for group_single');
        }
        report = await reportService.generateGroupSingleReport({
          orgId: request.org!.orgId,
          resultIds: body.resultIds,
          title: body.title || '团体测评报告',
          generatedBy: request.user!.id,
        });
        break;
      }
      case 'group_longitudinal': {
        if (!body.instanceId || !body.instanceType) {
          throw new ValidationError('instanceId and instanceType are required for group_longitudinal');
        }
        report = await reportService.generateGroupLongitudinalReport({
          orgId: request.org!.orgId,
          instanceId: body.instanceId,
          instanceType: body.instanceType,
          generatedBy: request.user!.id,
        });
        break;
      }
      case 'individual_trend': {
        if (!body.assessmentId || !body.userId) {
          throw new ValidationError('assessmentId and userId are required for individual_trend');
        }
        report = await reportService.generateTrendReport({
          orgId: request.org!.orgId,
          assessmentId: body.assessmentId,
          userId: body.userId,
          generatedBy: request.user!.id,
        });
        break;
      }
      default:
        throw new ValidationError(`Unsupported reportType: ${body.reportType}`);
    }

    await logAudit(request, 'create', 'assessment_reports', report.id);
    return reply.status(201).send(report);
  });

  /** Update report narrative (comprehensive advice) */
  app.patch('/:reportId/narrative', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request) => {
    const { reportId } = request.params as { reportId: string };
    const body = request.body as { narrative: string };

    const updated = await reportService.updateReportNarrative(reportId, body.narrative);
    await logAudit(request, 'update', 'assessment_reports', reportId);
    return updated;
  });

  /** Download a single report as PDF */
  app.get('/:reportId/pdf', async (request, reply) => {
    const { reportId } = request.params as { reportId: string };
    const pdf = await generateReportPDF(reportId);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="report_${reportId.slice(0, 8)}.pdf"`)
      .send(pdf);
  });

  /** Batch download multiple reports as ZIP */
  app.post('/batch-pdf', {
    preHandler: [requireRole('org_admin', 'counselor')],
  }, async (request, reply) => {
    const body = request.body as { reportIds: string[] };
    if (!body.reportIds || body.reportIds.length === 0) {
      throw new ValidationError('reportIds array is required');
    }
    const zip = await generateBatchPDFZip(body.reportIds);
    return reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', 'attachment; filename="reports.zip"')
      .send(zip);
  });
}
