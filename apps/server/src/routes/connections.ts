import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { connectionScope, requireRole } from '../auth.js';
import { whatsapp } from '../whatsapp/manager.js';

const include = { attendant: { select: { id: true, name: true } } } as const;
const params = z.object({ id: z.string() });

export async function connectionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  const manager = { preHandler: requireRole('ADMIN', 'GESTOR') };

  app.get('/api/connections', async (req) =>
    prisma.whatsAppConnection.findMany({
      where: connectionScope(req.user),
      include,
      orderBy: { createdAt: 'asc' },
    }),
  );

  app.post('/api/connections', manager, async (req, reply) => {
    const body = z
      .object({ name: z.string().min(1), attendantId: z.string().nullish() })
      .parse(req.body);
    const count = await prisma.whatsAppConnection.count();
    if (count >= config.MAX_CONNECTIONS) {
      return reply
        .code(400)
        .send({ error: `Limite de ${config.MAX_CONNECTIONS} números atingido` });
    }
    const conn = await prisma.whatsAppConnection.create({
      data: { name: body.name, attendantId: body.attendantId ?? null },
      include,
    });
    return reply.code(201).send(conn);
  });

  app.patch('/api/connections/:id', manager, async (req) => {
    const { id } = params.parse(req.params);
    const body = z
      .object({ name: z.string().min(1).optional(), attendantId: z.string().nullish() })
      .parse(req.body);
    return prisma.whatsAppConnection.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.attendantId !== undefined ? { attendantId: body.attendantId } : {}),
      },
      include,
    });
  });

  app.post('/api/connections/:id/start', manager, async (req) => {
    const { id } = params.parse(req.params);
    await prisma.whatsAppConnection.findUniqueOrThrow({ where: { id } });
    await whatsapp.start(id);
    return { ok: true };
  });

  app.post('/api/connections/:id/stop', manager, async (req) => {
    const { id } = params.parse(req.params);
    await whatsapp.stop(id);
    return { ok: true };
  });

  app.post('/api/connections/:id/logout', manager, async (req) => {
    const { id } = params.parse(req.params);
    await whatsapp.logout(id);
    return { ok: true };
  });

  app.get('/api/connections/:id/qr', manager, async (req) => {
    const { id } = params.parse(req.params);
    return { qr: whatsapp.getQr(id) };
  });

  app.delete('/api/connections/:id', manager, async (req) => {
    const { id } = params.parse(req.params);
    await whatsapp.remove(id);
    await prisma.whatsAppConnection.delete({ where: { id } });
    return { ok: true };
  });
}
