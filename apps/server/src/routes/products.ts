import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireRole } from '../auth.js';

const list = (max: number) => z.array(z.string().trim().min(1).max(30)).max(max);

export const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).nullish(),
  category: z.string().trim().max(60).nullish(),
  sku: z.string().trim().max(40).nullish(),
  priceCents: z.number().int().min(0).nullish(),
  sizes: list(30).default([]),
  colors: list(50).default([]),
  sizeSurchargeCents: z.record(z.string(), z.number().int().min(0)).nullish(),
  minQuantity: z.number().int().min(1).max(100000).default(1),
  customizable: z.boolean().default(false),
  imageUrl: z.string().trim().url().or(z.literal('')).nullish(),
  active: z.boolean().default(true),
  position: z.number().int().default(0),
  ncm: z.string().trim().regex(/^\d{8}$/, 'NCM deve ter 8 dígitos').or(z.literal('')).nullish(),
  cfop: z.string().trim().regex(/^\d{4}$/, 'CFOP deve ter 4 dígitos').or(z.literal('')).nullish(),
  origin: z.number().int().min(0).max(8).nullish(),
  unit: z.string().trim().min(1).max(6).default('UN'),
});

const clean = <T extends Record<string, unknown>>(d: T) => {
  const out: Record<string, unknown> = { ...d };
  for (const k of ['imageUrl', 'ncm', 'cfop']) if (out[k] === '') out[k] = null;
  return out as T;
};

export async function productRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  const manager = { preHandler: requireRole('ADMIN', 'GESTOR') };

  app.get('/api/products', async (req) => {
    const q = z.object({ active: z.enum(['true', 'false']).optional() }).parse(req.query);
    return prisma.product.findMany({
      where: q.active ? { active: q.active === 'true' } : {},
      orderBy: [{ category: 'asc' }, { position: 'asc' }, { name: 'asc' }],
    });
  });

  app.post('/api/products', manager, async (req, reply) => {
    const data = clean(productSchema.parse(req.body));
    return reply.code(201).send(await prisma.product.create({ data: data as never }));
  });

  /** Importação em lote (ex.: a partir de uma planilha) */
  app.post('/api/products/import', manager, async (req) => {
    const items = z.array(productSchema).min(1).max(1000).parse(req.body).map(clean);
    const r = await prisma.product.createMany({ data: items as never });
    return { created: r.count };
  });

  app.patch('/api/products/:id', manager, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const data = clean(productSchema.partial().parse(req.body));
    return prisma.product.update({ where: { id }, data: data as never });
  });

  app.delete('/api/products/:id', manager, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    // Produtos já usados em pedidos são só desativados, para manter o histórico
    const used = await prisma.orderItem.count({ where: { productId: id } });
    if (used) {
      await prisma.product.update({ where: { id }, data: { active: false } });
      return { ok: true, deactivated: true };
    }
    await prisma.product.delete({ where: { id } });
    return { ok: true };
  });
}
