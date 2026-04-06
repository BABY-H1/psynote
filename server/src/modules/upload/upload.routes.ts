import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/auth.js';
import { orgContextGuard } from '../../middleware/org-context.js';
import { saveUploadedFile } from '../../lib/file-upload.js';

export async function uploadRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authGuard);
  app.addHook('onRequest', orgContextGuard);

  // POST /api/orgs/:orgId/upload — upload a file
  app.post('/', async (request, reply) => {
    const orgId = request.org!.orgId;
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const buffer = await data.toBuffer();
    const result = await saveUploadedFile(orgId, buffer, data.filename);

    return reply.status(201).send({
      url: `/${result.filePath}`,
      fileName: result.fileName,
      fileType: result.fileType,
      fileSize: result.fileSize,
    });
  });
}
