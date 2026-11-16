import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config, webOrigins } from '../config.js';
import { logger } from '../logger.js';
import { emitToConnection, emitToManagers } from '../realtime.js';
import { sendPushForConnection } from '../push.js';
import { documentType, onlyDigits } from '../lib/documents.js';
import { whatsapp } from '../whatsapp/manager.js';
import { getCompany } from './company.js';
import { formatBRL, orderTotals, unitPrice } from './pricing.js';

export const orderInclude = {
  items: { orderBy: { position: 'asc' } },
  customer: true,
  connection: { select: { id: true, name: true } },
  conversation: { select: { id: true, contact: { select: { id: true, name: true, phone: true } } } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.OrderInclude;

export type OrderFull = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/** Erro de validação mostrado ao usuário (HTTP 400). */
const badRequest = (message: string) => Object.assign(new Error(message), { statusCode: 400 });

const newToken = () => crypto.randomBytes(18).toString('base64url');

export async function publicBaseUrl() {
  const company = await getCompany();
  return (company.publicUrl || config.PUBLIC_URL || webOrigins[0] || '').replace(/\/+$/, '');
}

export async function orderLink(token: string) {
  return `${await publicBaseUrl()}/p/${token}`;
}

/** Avisa a tela (tempo real) sobre mudança no pedido. */
export async function emitOrder(order: OrderFull) {
  if (order.connectionId) await emitToConnection(order.connectionId, 'order:update', order);
  else emitToManagers('order:update', order);
}

export async function createOrder(input: {
  conversationId?: string | null;
  createdById?: string | null;
  customerId?: string | null;
}) {
  let connectionId: string | null = null;
  let customerId = input.customerId ?? null;
  if (input.conversationId) {
    const conv = await prisma.conversation.findUnique({
      where: { id: input.conversationId },
      include: { contact: true },
    });
    if (!conv) throw new Error('Conversa não encontrada');
    connectionId = conv.connectionId;
    customerId ??= conv.contact.customerId;
  }
  const order = await prisma.order.create({
    data: {
      token: newToken(),
      conversationId: input.conversationId ?? null,
      connectionId,
      createdById: input.createdById ?? null,
      customerId,
    },
    include: orderInclude,
  });
  await emitOrder(order);
  return order;
}

/** Recalcula o total do pedido a partir dos itens. */
export async function recalcOrder(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  const t = orderTotals(order.items, order.discountCents, order.shippingCents);
  return prisma.order.update({ where: { id: orderId }, data: { totalCents: t.totalCents }, include: orderInclude });
}

/**
 * Envia o link de pedido pela conversa. Reaproveita um rascunho recente da mesma
 * conversa, para não criar vários pedidos vazios.
 */
export async function sendOrderLink(
  conversationId: string,
  opts: { userId?: string; sender: 'PANEL' | 'BOT'; template?: string },
) {
  const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { contact: true } });
  const recent = await prisma.order.findFirst({
    where: { conversationId, status: 'DRAFT', createdAt: { gt: new Date(Date.now() - 7 * 86400_000) } },
    orderBy: { createdAt: 'desc' },
    include: orderInclude,
  });
  const order = recent ?? (await createOrder({ conversationId, createdById: opts.userId }));
  const link = await orderLink(order.token);
  const company = await getCompany();
  const template = opts.template?.trim() || company.orderLinkMessage;
  const text = template.includes('{link}') ? template.replace('{link}', link) : `${template}\n${link}`;
  await whatsapp.sendText(conv.connectionId, conv.contact.jid, text, {
    sender: opts.sender,
    userId: opts.userId,
    typing: opts.sender === 'BOT',
    meta: { orderId: order.id },
  });
  return { order, link };
}

// ---------- Itens ----------
export const itemInputSchema = z.object({
  productId: z.string().nullish(),
  description: z.string().trim().max(200).optional(),
  size: z.string().trim().max(20).nullish(),
  color: z.string().trim().max(40).nullish(),
  quantity: z.number().int().min(1).max(100000),
  customization: z.string().trim().max(500).nullish(),
  /** Só a equipe pode definir o preço manualmente */
  unitPriceCents: z.number().int().min(0).nullish(),
});
export type ItemInput = z.infer<typeof itemInputSchema>;

/**
 * Monta os itens com nome e preço do catálogo.
 * `trustPrices` = equipe editando (pode sobrescrever preço e usar itens avulsos).
 */
export async function resolveItems(items: ItemInput[], trustPrices: boolean) {
  const ids = [...new Set(items.map((i) => i.productId).filter((x): x is string => Boolean(x)))];
  const products = await prisma.product.findMany({ where: { id: { in: ids } } });
  const byId = new Map(products.map((p) => [p.id, p]));
  if (!trustPrices) {
    // Quantidade mínima por produto (somando tamanhos e cores)
    const totals = new Map<string, number>();
    for (const i of items) if (i.productId) totals.set(i.productId, (totals.get(i.productId) ?? 0) + i.quantity);
    for (const [id, qty] of totals) {
      const p = byId.get(id);
      if (p && qty < p.minQuantity) {
        throw badRequest(`O pedido mínimo de "${p.name}" é de ${p.minQuantity} peças (você escolheu ${qty}).`);
      }
    }
  }
  return items.map((i, position) => {
    const product = i.productId ? byId.get(i.productId) : undefined;
    if (i.productId && !product) throw badRequest('Produto não encontrado');
    if (!product && !trustPrices) throw badRequest('Produto inválido');
    if (product && !trustPrices) {
      if (!product.active) throw badRequest(`O produto "${product.name}" não está mais disponível`);
      if (product.sizes.length && (!i.size || !product.sizes.includes(i.size))) {
        throw badRequest(`Escolha um tamanho válido para "${product.name}"`);
      }
      if (product.colors.length && i.color && !product.colors.includes(i.color)) {
        throw badRequest(`Cor inválida para "${product.name}"`);
      }
    }
    const catalogPrice = product ? unitPrice(product, i.size) : null;
    return {
      productId: product?.id ?? null,
      description: product?.name ?? i.description ?? 'Item',
      size: i.size || null,
      color: i.color || null,
      quantity: i.quantity,
      customization: product?.customizable || trustPrices ? i.customization || null : null,
      unitPriceCents: trustPrices && i.unitPriceCents !== undefined ? (i.unitPriceCents ?? null) : catalogPrice,
      position,
    };
  });
}

// ---------- Pedido enviado pelo cliente (link público) ----------
export const customerDataSchema = z.object({
  name: z.string().trim().min(2).max(120),
  document: z.string().trim().max(20).optional().default(''),
  email: z.string().trim().email().or(z.literal('')).optional().default(''),
  phone: z.string().trim().max(20).optional().default(''),
  stateRegistration: z.string().trim().max(20).optional().default(''),
  zipCode: z.string().trim().max(10).optional().default(''),
  street: z.string().trim().max(120).optional().default(''),
  number: z.string().trim().max(20).optional().default(''),
  complement: z.string().trim().max(60).optional().default(''),
  district: z.string().trim().max(60).optional().default(''),
  city: z.string().trim().max(60).optional().default(''),
  state: z.string().trim().max(2).optional().default(''),
  cityCode: z.string().trim().max(10).optional().default(''),
});
export type CustomerData = z.infer<typeof customerDataSchema>;

export const publicSubmitSchema = z.object({
  items: z.array(itemInputSchema).min(1, 'Escolha pelo menos um produto').max(200),
  customer: customerDataSchema,
  deliveryMethod: z.enum(['PICKUP', 'DELIVERY']).default('PICKUP'),
  desiredDate: z.coerce.date().nullish(),
  notes: z.string().trim().max(2000).optional().default(''),
});

/** Cria ou atualiza o cadastro do cliente a partir dos dados do pedido. */
async function upsertCustomer(data: CustomerData, existingId: string | null) {
  const doc = onlyDigits(data.document);
  const type = doc ? documentType(doc) : null;
  if (doc && !type) throw badRequest('CPF/CNPJ inválido');
  const fields = {
    name: data.name,
    personType: type ?? 'PF',
    document: doc || undefined,
    email: data.email || null,
    phone: onlyDigits(data.phone) || null,
    stateRegistration: data.stateRegistration || null,
    zipCode: onlyDigits(data.zipCode) || null,
    street: data.street || null,
    number: data.number || null,
    complement: data.complement || null,
    district: data.district || null,
    city: data.city || null,
    state: data.state ? data.state.toUpperCase() : null,
    cityCode: data.cityCode || null,
  } as const;
  if (doc) {
    const byDoc = await prisma.customer.findUnique({ where: { document: doc } });
    if (byDoc) return prisma.customer.update({ where: { id: byDoc.id }, data: fields });
  }
  if (existingId) {
    return prisma.customer.update({ where: { id: existingId }, data: fields }).catch(() => prisma.customer.create({ data: fields }));
  }
  return prisma.customer.create({ data: fields });
}

export async function submitPublicOrder(token: string, input: unknown) {
  const body = publicSubmitSchema.parse(input);
  const order = await prisma.order.findUnique({ where: { token }, include: { conversation: { include: { contact: true } } } });
  if (!order) throw Object.assign(new Error('Pedido não encontrado'), { statusCode: 404 });
  if (order.status !== 'DRAFT' && order.status !== 'SUBMITTED') {
    throw Object.assign(new Error('Este pedido já foi confirmado e não pode mais ser alterado. Fale com a gente pelo WhatsApp.'), {
      statusCode: 409,
    });
  }
  const items = await resolveItems(body.items, false);
  const customer = await upsertCustomer(body.customer, order.customerId);
  const firstSubmission = order.status === 'DRAFT';

  await prisma.$transaction([
    prisma.orderItem.deleteMany({ where: { orderId: order.id } }),
    prisma.orderItem.createMany({ data: items.map((i) => ({ ...i, orderId: order.id })) }),
    prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'SUBMITTED',
        customerId: customer.id,
        customerData: body.customer,
        deliveryMethod: body.deliveryMethod,
        desiredDate: body.desiredDate ?? null,
        customerNotes: body.notes || null,
        ...(firstSubmission ? { submittedAt: new Date() } : {}),
      },
    }),
    ...(order.conversation ? [prisma.contact.update({ where: { id: order.conversation.contactId }, data: { customerId: customer.id } })] : []),
  ]);
  const updated = await recalcOrder(order.id);
  await emitOrder(updated);
  notifySubmitted(updated, firstSubmission).catch((err) => logger.warn({ err }, 'falha ao avisar pedido'));
  return updated;
}

async function notifySubmitted(order: OrderFull, first: boolean) {
  const t = orderTotals(order.items, order.discountCents, order.shippingCents);
  const who = order.customer?.name ?? 'Cliente';
  const value = t.pendingPrices ? 'valores a definir' : formatBRL(t.totalCents);
  const payload = {
    title: `🧾 Pedido #${order.number} ${first ? 'enviado' : 'atualizado'} · ${who}`,
    body: `${t.quantity} peça(s) · ${value}`,
    url: `/pedidos/${order.id}`,
    tag: `order-${order.id}`,
  };
  if (order.connectionId) await sendPushForConnection(order.connectionId, payload);

  // Confirmação ao cliente pelo WhatsApp (só no primeiro envio)
  if (first && order.conversation && order.connectionId && whatsapp.isConnected(order.connectionId)) {
    const conv = await prisma.conversation.findUnique({ where: { id: order.conversation.id }, include: { contact: true } });
    const company = await getCompany();
    if (conv) {
      await whatsapp
        .sendText(conv.connectionId, conv.contact.jid, company.orderReceivedMessage.replace('{numero}', String(order.number)), {
          sender: 'BOT',
          meta: { orderId: order.id },
        })
        .catch((err) => logger.warn({ err }, 'falha ao confirmar pedido no WhatsApp'));
    }
  }
}
