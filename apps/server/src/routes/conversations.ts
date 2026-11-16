import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { connectionScope, type AuthUser } from '../auth.js';
import { sortByPriority } from '../lib/priority.js';
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
    return sortByPriority(items);
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
      data: { status: body.status, ...(body.status === 'CLOSED' ? { awaitingSince: null, unreadCount: 0 } : {}) },
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
}
