import { config } from './config.js';
import { buildApp } from './app.js';
import { setupRealtime } from './realtime.js';
import { initPush } from './push.js';
import { whatsapp } from './whatsapp/manager.js';
import { prisma } from './db.js';
import { startScheduler, stopScheduler } from './queue/scheduler.js';

const app = await buildApp();
setupRealtime(app);
await initPush();
await app.listen({ port: config.PORT, host: '0.0.0.0' });
await whatsapp.init();
startScheduler();

const shutdown = async () => {
  app.log.info('encerrando...');
  stopScheduler();
  await whatsapp.shutdown();
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
