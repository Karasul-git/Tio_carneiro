import type { FastifyInstance } from 'fastify';
import { requireRole } from '../auth.js';
import { getQueueSettings, saveQueueSettings } from '../queue/settings.js';

export async function queueRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  const manager = { preHandler: requireRole('ADMIN', 'GESTOR') };
  app.get('/api/queue/settings', manager, async () => getQueueSettings());
  app.put('/api/queue/settings', manager, async (req) => saveQueueSettings(req.body));
}
