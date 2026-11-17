import Fastify, { type FastifyBaseLogger } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { ZodError } from 'zod';
import { config, webOrigins } from './config.js';
import { registerAuth } from './auth.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { connectionRoutes } from './routes/connections.js';
import { conversationRoutes } from './routes/conversations.js';
import { pushRoutes } from './routes/push.js';
import { botRoutes } from './routes/bot.js';
import { productRoutes } from './routes/products.js';
import { customerRoutes } from './routes/customers.js';
import { orderRoutes } from './routes/orders.js';
import { publicRoutes } from './routes/public.js';
import { queueRoutes } from './routes/queue.js';
import { reportRoutes } from './routes/reports.js';
import { logger } from './logger.js';

export async function buildApp() {
  const app = Fastify({ loggerInstance: logger as FastifyBaseLogger });

  await app.register(cors, { origin: webOrigins, credentials: true });
  await registerAuth(app);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'Dados inválidos', details: err.issues });
    }
    if ((err as any)?.code === 'P2025') {
      return reply.code(404).send({ error: 'Registro não encontrado' });
    }
    const status = (err as any).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    return reply.code(status).send({ error: status >= 500 ? 'Erro interno' : (err as Error).message });
  });

  app.get('/api/health', async () => ({ ok: true }));
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(connectionRoutes);
  await app.register(conversationRoutes);
  await app.register(pushRoutes);
  await app.register(botRoutes);
  await app.register(productRoutes);
  await app.register(customerRoutes);
  await app.register(orderRoutes);
  await app.register(publicRoutes);
  await app.register(queueRoutes);
  await app.register(reportRoutes);

  // Em produção, a API também pode servir o app web já compilado.
  const webDist = config.WEB_DIST_DIR ? path.resolve(config.WEB_DIST_DIR) : '';
  if (webDist && fs.existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'Não encontrado' });
    });
  }

  return app;
}
