import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { getCompany } from '../orders/company.js';
import { orderTotals } from '../orders/pricing.js';
import { submitPublicOrder } from '../orders/service.js';

/** Limite simples por IP para as rotas públicas (sem login). */
const hits = new Map<string, { count: number; reset: number }>();
function rateLimited(ip: string, max = 60) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) {
    hits.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  h.count++;
  return h.count > max;
}

const tokenParam = z.object({ token: z.string().min(16).max(64) });

export async function publicRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    if (rateLimited(req.ip)) return reply.code(429).send({ error: 'Muitas tentativas. Aguarde um minuto.' });
  });

  /** Página de pedido: dados do pedido + catálogo */
  app.get('/api/public/orders/:token', async (req, reply) => {
    const { token } = tokenParam.parse(req.params);
    const order = await prisma.order.findUnique({
      where: { token },
      include: {
        items: { orderBy: { position: 'asc' } },
        customer: true,
        conversation: { include: { contact: true } },
      },
    });
    if (!order) return reply.code(404).send({ error: 'Link de pedido inválido ou expirado.' });
    const company = await getCompany();
    const products = await prisma.product.findMany({
      where: { active: true },
      orderBy: [{ category: 'asc' }, { position: 'asc' }, { name: 'asc' }],
    });
    const c = order.customer;
    const contact = order.conversation?.contact;
    const prefill = (order.customerData as Record<string, string> | null) ?? {
      name: c?.name ?? contact?.name ?? '',
      document: c?.document ?? '',
      email: c?.email ?? '',
      phone: c?.phone ?? contact?.phone ?? '',
      stateRegistration: c?.stateRegistration ?? '',
      zipCode: c?.zipCode ?? '',
      street: c?.street ?? '',
      number: c?.number ?? '',
      complement: c?.complement ?? '',
      district: c?.district ?? '',
      city: c?.city ?? '',
      state: c?.state ?? '',
      cityCode: c?.cityCode ?? '',
    };
    const showPrices = company.showPrices;
    const totals = orderTotals(order.items, order.discountCents, order.shippingCents);
    return {
      company: { name: company.name, intro: company.orderPageIntro, showPrices },
      order: {
        number: order.number,
        status: order.status,
        editable: order.status === 'DRAFT' || order.status === 'SUBMITTED',
        deliveryMethod: order.deliveryMethod,
        desiredDate: order.desiredDate,
        dueDate: order.dueDate,
        notes: order.customerNotes ?? '',
        customer: prefill,
        items: order.items.map((i) => ({
          productId: i.productId,
          description: i.description,
          size: i.size,
          color: i.color,
          quantity: i.quantity,
          customization: i.customization,
          unitPriceCents: showPrices ? i.unitPriceCents : null,
        })),
        ...(showPrices ? { totalCents: order.totalCents, pendingPrices: totals.pendingPrices } : {}),
      },
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        category: p.category,
        imageUrl: p.imageUrl,
        sizes: p.sizes,
        colors: p.colors,
        minQuantity: p.minQuantity,
        customizable: p.customizable,
        priceCents: showPrices ? p.priceCents : null,
        sizeSurchargeCents: showPrices ? p.sizeSurchargeCents : null,
      })),
    };
  });

  app.put('/api/public/orders/:token', async (req) => {
    const { token } = tokenParam.parse(req.params);
    const order = await submitPublicOrder(token, req.body);
    return { ok: true, number: order.number, status: order.status };
  });
}
