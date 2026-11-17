import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../auth.js';
import { buildOverview } from '../reports/service.js';
import { buildWorkbook } from '../reports/export.js';

/** Período em datas locais (Brasília, sem horário de verão desde 2019). */
const periodSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  connectionId: z.string().optional(),
});

function parsePeriod(query: unknown) {
  const q = periodSchema.parse(query);
  const from = new Date(`${q.from}T00:00:00-03:00`);
  const to = new Date(`${q.to}T23:59:59.999-03:00`);
  if (to < from) throw Object.assign(new Error('Período inválido'), { statusCode: 400 });
  if (to.getTime() - from.getTime() > 400 * 86400_000) throw Object.assign(new Error('Período máximo: 1 ano'), { statusCode: 400 });
  return { from, to, connectionId: q.connectionId || undefined, label: `${q.from}_a_${q.to}` };
}

export async function reportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  const manager = { preHandler: requireRole('ADMIN', 'GESTOR') };

  app.get('/api/reports/overview', manager, async (req) => {
    const p = parsePeriod(req.query);
    return buildOverview(p);
  });

  app.get('/api/reports/export', manager, async (req, reply) => {
    const p = parsePeriod(req.query);
    const wb = await buildWorkbook(p);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="relatorio_${p.label}.xlsx"`)
      .send(buffer);
  });
}
