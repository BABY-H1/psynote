import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { requireRole } from '../../middleware/rbac.js';
import { logAudit } from '../../middleware/audit.js';
import { ValidationError } from '../../lib/errors.js';
import * as reportService from './report.service.js';

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
      title?: string;
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
      default:
        throw new ValidationError(`Unsupported reportType: ${body.reportType}`);
    }

    await logAudit(request, 'create', 'assessment_reports', report.id);
    return reply.status(201).send(report);
  });
}
