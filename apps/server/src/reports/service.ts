import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { dayKey, daysBetween, durationStats, responseEpisodes } from './metrics.js';

export type ReportFilter = { from: Date; to: Date; connectionId?: string };

const SOLD = ['CONFIRMED', 'IN_PRODUCTION', 'READY', 'DELIVERED'] as const;

const INTENTS: Record<string, string> = {
  orcamento: 'Orçamento / pedido',
  duvida: 'Dúvida',
  acompanhamento: 'Acompanhamento',
  atendente: 'Pediu atendente',
};

/** Visão geral do período para a gestão. */
export async function buildOverview({ from, to, connectionId }: ReportFilter) {
  const connWhere = connectionId ? { connectionId } : {};
  const connections = await prisma.whatsAppConnection.findMany({
    where: connectionId ? { id: connectionId } : {},
    select: { id: true, name: true, attendant: { select: { name: true } } },
  });

  // ---------- Atendimento ----------
  // Mensagens do período (com 1 dia antes, para pegar esperas que começaram antes)
  const messages = await prisma.message.findMany({
    where: {
      timestamp: { gte: new Date(from.getTime() - 86400_000), lte: to },
      conversation: connWhere,
    },
    select: { conversationId: true, timestamp: true, fromMe: true, sender: true, conversation: { select: { connectionId: true } } },
    orderBy: { timestamp: 'asc' },
    take: 300_000,
  });
  const inRange = (d: Date) => d >= from && d <= to;
  const byConv = new Map<string, typeof messages>();
  for (const m of messages) {
    const list = byConv.get(m.conversationId) ?? [];
    list.push(m);
    byConv.set(m.conversationId, list);
  }

  const days = daysBetween(from, to);
  const daily = new Map(days.map((d) => [d, { conversations: 0, orders: 0, revenueCents: 0 }]));
  const perConn = new Map(
    connections.map((c) => [c.id, { conversations: 0, messagesIn: 0, messagesOut: 0, minutes: [] as number[], ordersConfirmed: 0, revenueCents: 0 }]),
  );

  const allMinutes: number[] = [];
  let activeConversations = 0;
  let messagesIn = 0;
  let messagesOut = 0;
  let botMessages = 0;
  for (const [, list] of byConv) {
    const connId = list[0].conversation.connectionId;
    const pc = perConn.get(connId);
    const periodMsgs = list.filter((m) => inRange(m.timestamp));
    const customerMsgs = periodMsgs.filter((m) => !m.fromMe);
    if (customerMsgs.length) {
      activeConversations++;
      if (pc) pc.conversations++;
      // conversa conta no dia da primeira mensagem do cliente no período
      const d = daily.get(dayKey(customerMsgs[0].timestamp));
      if (d) d.conversations++;
    }
    for (const m of periodMsgs) {
      if (!m.fromMe) messagesIn++;
      else {
        messagesOut++;
        if (m.sender === 'BOT') botMessages++;
      }
      if (pc) {
        if (m.fromMe) pc.messagesOut++;
        else pc.messagesIn++;
      }
    }
    for (const e of responseEpisodes(list)) {
      if (e.minutes != null && e.end && inRange(e.end)) {
        allMinutes.push(e.minutes);
        pc?.minutes.push(e.minutes);
      }
    }
  }

  const sessionWhere: Prisma.ConversationWhereInput = { ...connWhere, sessionStartedAt: { gte: from, lte: to } };
  const [handoffs, botResolved, intents, waitingNow] = await Promise.all([
    prisma.conversation.count({ where: { ...sessionWhere, handoffAt: { not: null } } }),
    prisma.conversation.count({ where: { ...sessionWhere, handoffAt: null, botState: 'FAQ' } }),
    prisma.conversation.groupBy({ by: ['intent'], where: { ...sessionWhere, intent: { not: null } }, _count: true }),
    prisma.conversation.count({ where: { ...connWhere, status: 'OPEN', awaitingSince: { not: null } } }),
  ]);

  // ---------- Pedidos ----------
  const orders = await prisma.order.findMany({
    where: {
      ...connWhere,
      OR: [{ createdAt: { gte: from, lte: to } }, { confirmedAt: { gte: from, lte: to } }, { submittedAt: { gte: from, lte: to } }],
    },
    include: { items: true },
  });
  const sold = orders.filter((o) => (SOLD as readonly string[]).includes(o.status) && o.confirmedAt && inRange(o.confirmedAt));
  const revenueCents = sold.reduce((s, o) => s + o.totalCents, 0);
  const pieces = sold.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);
  for (const o of sold) {
    const d = daily.get(dayKey(o.confirmedAt!));
    if (d) {
      d.orders++;
      d.revenueCents += o.totalCents;
    }
    const pc = o.connectionId ? perConn.get(o.connectionId) : undefined;
    if (pc) {
      pc.ordersConfirmed++;
      pc.revenueCents += o.totalCents;
    }
  }
  const linksSent = orders.filter((o) => inRange(o.createdAt)).length;
  const submitted = orders.filter((o) => o.submittedAt && inRange(o.submittedAt)).length;

  const productMap = new Map<string, { quantity: number; revenueCents: number }>();
  for (const o of sold) {
    for (const i of o.items) {
      const p = productMap.get(i.description) ?? { quantity: 0, revenueCents: 0 };
      p.quantity += i.quantity;
      p.revenueCents += i.quantity * (i.unitPriceCents ?? 0);
      productMap.set(i.description, p);
    }
  }

  return {
    period: { from, to },
    service: {
      conversations: activeConversations,
      messagesIn,
      messagesOut,
      botMessages,
      handoffs,
      botResolved,
      waitingNow,
      responseTime: durationStats(allMinutes),
      intents: intents
        .map((i) => ({ intent: i.intent!, label: INTENTS[i.intent!] ?? i.intent!, count: i._count }))
        .sort((a, b) => b.count - a.count),
    },
    orders: {
      linksSent,
      submitted,
      confirmed: sold.length,
      revenueCents,
      averageTicketCents: sold.length ? Math.round(revenueCents / sold.length) : 0,
      pieces,
      openNow: await prisma.order.count({ where: { ...connWhere, status: { in: ['SUBMITTED', 'CONFIRMED', 'IN_PRODUCTION', 'READY'] } } }),
      topProducts: [...productMap.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10),
    },
    byConnection: connections.map((c) => {
      const pc = perConn.get(c.id)!;
      return {
        id: c.id,
        name: c.name,
        attendant: c.attendant?.name ?? null,
        conversations: pc.conversations,
        messagesIn: pc.messagesIn,
        messagesOut: pc.messagesOut,
        responseTime: durationStats(pc.minutes),
        ordersConfirmed: pc.ordersConfirmed,
        revenueCents: pc.revenueCents,
      };
    }),
    daily: days.map((d) => ({ day: d, ...daily.get(d)! })),
  };
}
