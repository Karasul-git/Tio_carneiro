import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { connectionScope, isManager, requireRole, type AuthUser } from '../auth.js';
import { getCompany, saveCompany } from '../orders/company.js';
import {
  createOrder,
  emitOrder,
  itemInputSchema,
  orderInclude,
  orderLink,
  recalcOrder,
  resolveItems,
  sendOrderLink,
} from '../orders/service.js';

const STATUS = ['DRAFT', 'SUBMITTED', 'CONFIRMED', 'IN_PRODUCTION', 'READY', 'DELIVERED', 'CANCELLED'] as const;

/** Pedidos que o usuário pode ver: gestores veem todos; atendentes, os dos seus números ou criados por eles. */
function orderScope(u: AuthUser): Prisma.OrderWhereInput {
  if (isManager(u)) return {};
  return { OR: [{ connection: connectionScope(u) }, { createdById: u.sub }] };
}

async function findAccessible(u: AuthUser, id: string) {
  return prisma.order.findFirst({ where: { id, ...orderScope(u) }, include: orderInclude });
}

export async function orderRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/api/orders', async (req) => {
    const q = z
      .object({
        status: z.enum([...STATUS, 'open', 'all']).default('open'),
        search: z.string().optional(),
        conversationId: z.string().optional(),
      })
      .parse(req.query);
    const s = q.search?.trim();
    const num = s && /^#?\d+$/.test(s) ? Number(s.replace('#', '')) : null;
    const where: Prisma.OrderWhereInput = {
      ...orderScope(req.user),
      ...(q.conversationId ? { conversationId: q.conversationId } : {}),
      ...(q.status === 'open'
        ? { status: { in: ['SUBMITTED', 'CONFIRMED', 'IN_PRODUCTION', 'READY'] } }
        : q.status === 'all'
          ? {}
          : { status: q.status }),
      ...(s
        ? num
          ? { number: num }
          : { customer: { name: { contains: s, mode: 'insensitive' } } }
        : {}),
    };
    const [orders, counts] = await Promise.all([
      prisma.order.findMany({ where, include: orderInclude, orderBy: [{ updatedAt: 'desc' }], take: 300 }),
      prisma.order.groupBy({ by: ['status'], where: orderScope(req.user), _count: true }),
    ]);
    return { orders, counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) };
  });

  app.get('/api/orders/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const order = await findAccessible(req.user, id);
    if (!order) return reply.code(404).send({ error: 'Pedido não encontrado' });
    return { ...order, link: await orderLink(order.token) };
  });

  /** Cria um pedido (avulso ou ligado a uma conversa) */
  app.post('/api/orders', async (req, reply) => {
    const body = z
      .object({ conversationId: z.string().nullish(), customerId: z.string().nullish() })
      .parse(req.body ?? {});
    if (body.conversationId) {
      const ok = await prisma.conversation.count({
        where: { id: body.conversationId, connection: connectionScope(req.user) },
      });
      if (!ok) return reply.code(404).send({ error: 'Conversa não encontrada' });
    }
    const order = await createOrder({ ...body, createdById: req.user.sub });
    return reply.code(201).send({ ...order, link: await orderLink(order.token) });
  });

  /** Envia o link de pedido para o cliente pela conversa */
  app.post('/api/conversations/:id/order-link', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const ok = await prisma.conversation.count({ where: { id, connection: connectionScope(req.user) } });
    if (!ok) return reply.code(404).send({ error: 'Conversa não encontrada' });
    try {
      const { order, link } = await sendOrderLink(id, { userId: req.user.sub, sender: 'PANEL' });
      return { orderId: order.id, number: order.number, link };
    } catch (err: any) {
      return reply.code(409).send({ error: err?.message ?? 'Falha ao enviar o link' });
    }
  });

  app.patch('/api/orders/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const order = await findAccessible(req.user, id);
    if (!order) return reply.code(404).send({ error: 'Pedido não encontrado' });
    const body = z
      .object({
        status: z.enum(STATUS).optional(),
        items: z.array(itemInputSchema).max(200).optional(),
        customerId: z.string().nullish(),
        deliveryMethod: z.enum(['PICKUP', 'DELIVERY']).optional(),
        desiredDate: z.coerce.date().nullish(),
        dueDate: z.coerce.date().nullish(),
        internalNotes: z.string().max(5000).nullish(),
        discountCents: z.number().int().min(0).optional(),
        shippingCents: z.number().int().min(0).optional(),
      })
      .parse(req.body);

    const { items, status, ...rest } = body;
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (items) {
      const resolved = await resolveItems(items, true);
      ops.push(prisma.orderItem.deleteMany({ where: { orderId: id } }));
      ops.push(prisma.orderItem.createMany({ data: resolved.map((i) => ({ ...i, orderId: id })) }));
    }
    ops.push(
      prisma.order.update({
        where: { id },
        data: {
          ...rest,
          ...(status ? { status } : {}),
          ...(status === 'CONFIRMED' && !order.confirmedAt ? { confirmedAt: new Date() } : {}),
        },
      }),
    );
    await prisma.$transaction(ops);
    const updated = await recalcOrder(id);
    await emitOrder(updated);
    return { ...updated, link: await orderLink(updated.token) };
  });

  app.delete('/api/orders/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const order = await findAccessible(req.user, id);
    if (!order) return reply.code(404).send({ error: 'Pedido não encontrado' });
    // Só rascunhos podem ser apagados; os demais são cancelados
    if (order.status !== 'DRAFT') return reply.code(409).send({ error: 'Só rascunhos podem ser excluídos. Use "Cancelar".' });
    await prisma.order.delete({ where: { id } });
    return { ok: true };
  });

  // ---- Dados da empresa e textos do link ----
  app.get('/api/company', async () => getCompany());
  app.put('/api/company', { preHandler: requireRole('ADMIN', 'GESTOR') }, async (req) => saveCompany(req.body));
}
