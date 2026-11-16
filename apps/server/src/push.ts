import * as webpush from 'web-push';
import { config } from './config.js';
import { prisma } from './db.js';
import { logger } from './logger.js';

type VapidKeys = { publicKey: string; privateKey: string };
let keys: VapidKeys | null = null;

/** Carrega as chaves VAPID do .env, ou do banco (gerando na primeira execução). */
export async function initPush() {
  if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY) {
    keys = { publicKey: config.VAPID_PUBLIC_KEY, privateKey: config.VAPID_PRIVATE_KEY };
  } else {
    const stored = await prisma.setting.findUnique({ where: { key: 'vapid' } });
    if (stored) {
      keys = stored.value as VapidKeys;
    } else {
      keys = webpush.generateVAPIDKeys();
      await prisma.setting.create({ data: { key: 'vapid', value: keys } });
      logger.info('chaves VAPID geradas e salvas no banco');
    }
  }
  webpush.setVapidDetails(config.VAPID_SUBJECT, keys.publicKey, keys.privateKey);
}

export const getPublicKey = () => keys?.publicKey ?? null;

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  if (!keys || userIds.length === 0) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 },
        );
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        } else {
          logger.warn({ err: err?.message }, 'falha ao enviar push');
        }
      }
    }),
  );
}

/**
 * Notifica quem cuida de uma conexão: o atendente responsável ou, se não houver,
 * os gestores e administradores.
 */
export async function sendPushForConnection(connectionId: string, payload: PushPayload) {
  const conn = await prisma.whatsAppConnection.findUnique({
    where: { id: connectionId },
    select: { attendantId: true },
  });
  let userIds: string[];
  if (conn?.attendantId) {
    userIds = [conn.attendantId];
  } else {
    const managers = await prisma.user.findMany({
      where: { active: true, role: { in: ['ADMIN', 'GESTOR'] } },
      select: { id: true },
    });
    userIds = managers.map((m) => m.id);
  }
  await sendPushToUsers(userIds, payload);
}
