import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { getPublicKey, sendPushToUsers } from '../push.js';

export async function pushRoutes(app: FastifyInstance) {
  app.get('/api/push/public-key', async () => ({ publicKey: getPublicKey() }));

  app.post('/api/push/subscribe', { preHandler: app.authenticate }, async (req) => {
    const body = z
      .object({
        endpoint: z.string().url(),
        keys: z.object({ p256dh: z.string(), auth: z.string() }),
      })
      .parse(req.body);
    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: { endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, userId: req.user.sub },
      update: { p256dh: body.keys.p256dh, auth: body.keys.auth, userId: req.user.sub },
    });
    return { ok: true };
  });

  app.post('/api/push/unsubscribe', { preHandler: app.authenticate }, async (req) => {
    const { endpoint } = z.object({ endpoint: z.string() }).parse(req.body);
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user.sub } });
    return { ok: true };
  });

  app.post('/api/push/test', { preHandler: app.authenticate }, async (req) => {
    await sendPushToUsers([req.user.sub], {
      title: 'Notificações ativadas',
      body: 'Você vai receber os avisos de novos atendimentos aqui.',
      url: '/',
    });
    return { ok: true };
  });
}
