import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { connectionScope, type AuthUser } from '../auth.js';
import { priority, sortByPriority } from '../lib/priority.js';
import { getQueueSettings } from '../queue/settings.js';
import { emitToConnection } from '../realtime.js';
import { whatsapp } from '../whatsapp/manager.js';
import { generateSummary } from '../bot/runner.js';

const include = {
  contact: true,
  connection: { select: { id: true, name: true } },
} as const;

async function findAccessible(user: AuthUser, id: string) {
  return prisma.conversation.findFirst({
    where: { id, connection: connectionScope(user) },
    include,
  });
}

export async function conversationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/api/conversations', async (req) => {
    const q = z
      .object({
        connectionId: z.string().optional(),
        filter: z.enum(['awaiting', 'triage', 'open', 'closed', 'all']).default('open'),
        search: z.string().optional(),
      })
      .parse(req.query);

    const where: Prisma.ConversationWhereInput = {
      connection: connectionScope(req.user),
      ...(q.connectionId ? { connectionId: q.connectionId } : {}),
      // Aguardando atendente: cliente sem resposta e fora da triagem do robô
      ...(q.filter === 'awaiting'
        ? { awaitingSince: { not: null }, status: 'OPEN', botState: { in: ['NONE', 'HANDOFF', 'HUMAN'] } }
        : {}),
      // Em triagem: o robô está conversando com o cliente
      ...(q.filter === 'triage' ? { status: 'OPEN', botState: { in: ['MENU', 'COLLECTING', 'FAQ'] } } : {}),
      ...(q.filter === 'open' ? { status: 'OPEN' } : {}),
      ...(q.filter === 'closed' ? { status: 'CLOSED' } : {}),
      ...(q.search
        ? {
            contact: {
              OR: [
                { name: { contains: q.search, mode: 'insensitive' } },
                { phone: { contains: q.search.replace(/\D/g, '') || q.search } },
              ],
            },
          }
        : {}),
    };

    const items = await prisma.conversation.findMany({
      where,
      include,
      orderBy: [
        { awaitingSince: { sort: 'asc', nulls: 'last' } },
        { lastMessageAt: { sort: 'desc', nulls: 'last' } },
      ],
      take: 300,
    });

    // Dados do cliente para as regras de prioridade (recorrente / compra muito)
    const { priority: cfg } = await getQueueSettings();
    const customerIds = [...new Set(items.map((c) => c.contact.customerId).filter((x): x is string => Boolean(x)))];
    const stats = new Map<string, { orders: number; spent: number }>();
    if (customerIds.length && (cfg.recurringWeight > 0 || cfg.bigCustomerWeight > 0)) {
      const yearAgo = new Date(Date.now() - 365 * 86400_000);
      const [counts, spent] = await Promise.all([
        prisma.order.groupBy({
          by: ['customerId'],
          where: { customerId: { in: customerIds }, status: { notIn: ['DRAFT', 'CANCELLED'] } },
          _count: true,
        }),
        prisma.order.groupBy({
          by: ['customerId'],
          where: { customerId: { in: customerIds }, status: { notIn: ['DRAFT', 'CANCELLED'] }, createdAt: { gte: yearAgo } },
          _sum: { totalCents: true },
        }),
      ]);
      for (const c of counts) stats.set(c.customerId!, { orders: c._count, spent: 0 });
      for (const c of spent) {
        const st = stats.get(c.customerId!) ?? { orders: 0, spent: 0 };
        st.spent = c._sum.totalCents ?? 0;
        stats.set(c.customerId!, st);
      }
    }
    const now = new Date();
    const enriched = items.map((c) => {
      const st = c.contact.customerId ? stats.get(c.contact.customerId) : undefined;
      const input = {
        ...c,
        customerOrders: st?.orders ?? 0,
        customerSpentCents: st?.spent ?? 0,
      };
      return { ...input, priority: priority(input, now, cfg) };
    });
    return sortByPriority(enriched, now, cfg);
  });

  app.get('/api/conversations/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const conv = await findAccessible(req.user, id);
    if (!conv) return reply.code(404).send({ error: 'Conversa não encontrada' });
    return conv;
  });

  app.get('/api/conversations/:id/messages', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const q = z
      .object({ before: z.coerce.date().optional(), limit: z.coerce.number().min(1).max(200).default(50) })
      .parse(req.query);
    if (!(await findAccessible(req.user, id))) {
      return reply.code(404).send({ error: 'Conversa não encontrada' });
    }
    const messages = await prisma.message.findMany({
      where: { conversationId: id, ...(q.before ? { timestamp: { lt: q.before } } : {}) },
      orderBy: { timestamp: 'desc' },
      take: q.limit,
      include: { sentByUser: { select: { id: true, name: true } } },
    });
    return messages.reverse();
  });

  app.post('/api/conversations/:id/messages', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { text } = z.object({ text: z.string().trim().min(1).max(4096) }).parse(req.body);
    const conv = await findAccessible(req.user, id);
    if (!conv) return reply.code(404).send({ error: 'Conversa não encontrada' });
    try {
      const waId = await whatsapp.sendText(conv.connectionId, conv.contact.jid, text, {
        sender: 'PANEL',
        userId: req.user.sub,
      });
      return { ok: true, waMessageId: waId };
    } catch (err: any) {
      return reply.code(409).send({ error: err?.message ?? 'Falha ao enviar' });
    }
  });

  app.post('/api/conversations/:id/read', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const conv = await findAccessible(req.user, id);
    if (!conv) return reply.code(404).send({ error: 'Conversa não encontrada' });
    const updated = await prisma.conversation.update({ where: { id }, data: { unreadCount: 0 }, include });
    await emitToConnection(conv.connectionId, 'conversation:update', updated);
    return updated;
  });

  app.patch('/api/conversations/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ status: z.enum(['OPEN', 'CLOSED']) }).parse(req.body);
    const conv = await findAccessible(req.user, id);
    if (!conv) return reply.code(404).send({ error: 'Conversa não encontrada' });
    const updated = await prisma.conversation.update({
      where: { id },
      // Encerrar tira da fila de espera
      data: {
        status: body.status,
        ...(body.status === 'CLOSED' ? { awaitingSince: null, unreadCount: 0, unhappy: false, urgent: false } : {}),
      },
      include,
    });
    await emitToConnection(conv.connectionId, 'conversation:update', updated);
    return updated;
  });

  /** Atendente assume a conversa: o robô para de responder nesta sessão */
  app.post('/api/conversations/:id/takeover', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const conv = await findAccessible(req.user, id);
    if (!conv) return reply.code(404).send({ error: 'Conversa não encontrada' });
    const updated = await prisma.conversation.update({ where: { id }, data: { botState: 'HUMAN' }, include });
    await emitToConnection(conv.connectionId, 'conversation:update', updated);
    return updated;
  });

  /** Gera (ou atualiza) o resumo do atendimento */
  app.post('/api/conversations/:id/summary', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const conv = await findAccessible(req.user, id);
    if (!conv) return reply.code(404).send({ error: 'Conversa não encontrada' });
    return generateSummary(id);
  });

  /** Adia os lembretes desta conversa por alguns minutos */
  app.post('/api/conversations/:id/snooze', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { minutes } = z.object({ minutes: z.number().int().min(5).max(7 * 1440) }).parse(req.body);
    const conv = await findAccessible(req.user, id);
    if (!conv) return reply.code(404).send({ error: 'Conversa não encontrada' });
    const updated = await prisma.conversation.update({
      where: { id },
      data: { snoozedUntil: new Date(Date.now() + minutes * 60_000) },
      include,
    });
    await emitToConnection(conv.connectionId, 'conversation:update', updated);
    return updated;
  });

  /** "Não precisa responder": tira da fila de espera (ex.: cliente só agradeceu) */
  app.post('/api/conversations/:id/no-reply', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const conv = await findAccessible(req.user, id);
    if (!conv) return reply.code(404).send({ error: 'Conversa não encontrada' });
    const updated = await prisma.conversation.update({
      where: { id },
      data: { awaitingSince: null, unreadCount: 0, unhappy: false, urgent: false, snoozedUntil: null },
      include,
    });
    await emitToConnection(conv.connectionId, 'conversation:update', updated);
    return updated;
  });
}
