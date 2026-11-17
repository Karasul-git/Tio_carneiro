import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { sendPushToUsers, type PushPayload } from '../push.js';
import { emitToConnection } from '../realtime.js';
import { getBotSettings } from '../bot/settings.js';
import { isOpen } from '../bot/hours.js';
import { getQueueSettings } from './settings.js';
import { dueReminders, formatWait } from './reminders.js';

/**
 * Agendador dos lembretes: a cada minuto verifica atendimentos esquecidos e
 * pedidos parados, e avisa por notificação push.
 *
 * Roda dentro do próprio servidor (uma instância). Os lembretes são agrupados
 * por pessoa para não virar uma enxurrada de notificações.
 */
const TICK_MS = 60_000;
const BOT_TRIAGE = ['MENU', 'COLLECTING', 'FAQ'];

type Notice = { title: string; line: string; url: string };

async function managerIds() {
  const managers = await prisma.user.findMany({ where: { active: true, role: { in: ['ADMIN', 'GESTOR'] } }, select: { id: true } });
  return managers.map((m) => m.id);
}

/** Junta os avisos por pessoa e envia um push por pessoa. */
async function deliver(byUser: Map<string, Notice[]>, kind: 'conversas' | 'pedidos') {
  for (const [userId, notices] of byUser) {
    const payload: PushPayload =
      notices.length === 1
        ? { title: notices[0].title, body: notices[0].line, url: notices[0].url, tag: `reminder-${kind}` }
        : {
            title: kind === 'conversas' ? `⏰ ${notices.length} clientes esperando resposta` : `📦 ${notices.length} pedidos precisam de atenção`,
            body: notices.slice(0, 5).map((n) => n.line).join('\n') + (notices.length > 5 ? `\n+${notices.length - 5}…` : ''),
            url: kind === 'conversas' ? '/' : '/pedidos',
            tag: `reminder-${kind}`,
          };
    await sendPushToUsers([userId], payload);
  }
}

function push(map: Map<string, Notice[]>, userIds: string[], n: Notice) {
  for (const id of new Set(userIds)) {
    const list = map.get(id) ?? [];
    list.push(n);
    map.set(id, list);
  }
}

export async function runConversationReminders(now = new Date()) {
  const { reminders: cfg } = await getQueueSettings();
  if (!cfg.enabled) return 0;
  if (cfg.onlyBusinessHours && !isOpen((await getBotSettings()).businessHours, now)) return 0;

  const convs = await prisma.conversation.findMany({
    where: { status: 'OPEN', awaitingSince: { not: null } },
    include: { contact: true, connection: { select: { id: true, name: true, attendantId: true } } },
    take: 1000,
  });
  const due = dueReminders(
    convs.map((c) => ({
      id: c.id,
      awaitingSince: c.awaitingSince,
      inBotTriage: BOT_TRIAGE.includes(c.botState),
      lastMessageAt: c.lastMessageAt,
      reminderFor: c.reminderFor,
      remindersSent: c.remindersSent,
      lastReminderAt: c.lastReminderAt,
      snoozedUntil: c.snoozedUntil,
    })),
    cfg,
    now,
  );
  if (!due.length) return 0;

  const managers = await managerIds();
  const byId = new Map(convs.map((c) => [c.id, c]));
  const byUser = new Map<string, Notice[]>();
  for (const d of due) {
    const c = byId.get(d.id)!;
    const who = c.contact.name || c.contact.phone || 'Cliente';
    const attendant = c.connection.attendantId;
    const recipients = attendant ? [attendant, ...(d.escalate ? managers : [])] : managers;
    push(byUser, recipients, {
      title: `⏰ ${who} espera resposta há ${formatWait(d.waitingMinutes)}`,
      line: `${who} · ${formatWait(d.waitingMinutes)}${c.unhappy ? ' · 😠' : ''}${c.urgent ? ' · ⚡' : ''} (${c.connection.name})`,
      url: `/conversas/${c.id}`,
    });
    const updated = await prisma.conversation.update({
      where: { id: c.id },
      data: { reminderFor: c.awaitingSince, remindersSent: d.nth, lastReminderAt: now },
      include: { contact: true, connection: { select: { id: true, name: true } } },
    });
    await emitToConnection(c.connectionId, 'conversation:update', updated);
  }
  await deliver(byUser, 'conversas');
  logger.info({ count: due.length }, 'lembretes de atendimento enviados');
  return due.length;
}

export async function runOrderReminders(now = new Date()) {
  const { orderReminders: cfg } = await getQueueSettings();
  if (!cfg.enabled) return 0;
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const stale = await prisma.order.findMany({
    where: {
      status: 'SUBMITTED',
      submittedAt: { lt: new Date(now.getTime() - cfg.submittedHours * 3600_000) },
      lastReminderAt: null,
    },
    include: { customer: true, connection: { select: { attendantId: true } } },
    take: 200,
  });
  const dueSoon = await prisma.order.findMany({
    where: {
      status: { in: ['CONFIRMED', 'IN_PRODUCTION'] },
      dueDate: { not: null, lte: new Date(now.getTime() + cfg.dueSoonDays * 86400_000 + 86400_000) },
      OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: startOfDay } }],
    },
    include: { customer: true, connection: { select: { attendantId: true } } },
    take: 200,
  });
  if (!stale.length && !dueSoon.length) return 0;

  const managers = await managerIds();
  const byUser = new Map<string, Notice[]>();
  for (const o of stale) {
    const hours = Math.floor((now.getTime() - o.submittedAt!.getTime()) / 3600_000);
    push(byUser, [...managers, ...(o.connection?.attendantId ? [o.connection.attendantId] : [])], {
      title: `📦 Pedido #${o.number} aguardando confirmação`,
      line: `#${o.number} ${o.customer?.name ?? ''} · enviado há ${hours}h, falta confirmar`,
      url: `/pedidos/${o.id}`,
    });
  }
  for (const o of dueSoon) {
    const days = Math.ceil((o.dueDate!.getTime() - now.getTime()) / 86400_000);
    const when = days < 0 ? `atrasado ${-days} dia(s)` : days === 0 ? 'vence hoje' : `vence em ${days} dia(s)`;
    push(byUser, [...managers, ...(o.connection?.attendantId ? [o.connection.attendantId] : [])], {
      title: `📦 Pedido #${o.number} ${when}`,
      line: `#${o.number} ${o.customer?.name ?? ''} · ${when}`,
      url: `/pedidos/${o.id}`,
    });
  }
  await prisma.order.updateMany({ where: { id: { in: [...stale, ...dueSoon].map((o) => o.id) } }, data: { lastReminderAt: now } });
  await deliver(byUser, 'pedidos');
  return stale.length + dueSoon.length;
}

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startScheduler() {
  if (timer) return;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runConversationReminders();
      await runOrderReminders();
    } catch (err) {
      logger.error({ err }, 'falha no agendador de lembretes');
    } finally {
      running = false;
    }
  };
  timer = setInterval(tick, TICK_MS);
  timer.unref?.();
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
