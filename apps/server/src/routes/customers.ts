import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { documentType, onlyDigits } from '../lib/documents.js';

const customerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  document: z.string().trim().max(20).nullish(),
  stateRegistration: z.string().trim().max(20).nullish(),
  email: z.string().trim().email().or(z.literal('')).nullish(),
  phone: z.string().trim().max(20).nullish(),
  zipCode: z.string().trim().max(10).nullish(),
  street: z.string().trim().max(120).nullish(),
  number: z.string().trim().max(20).nullish(),
  complement: z.string().trim().max(60).nullish(),
  district: z.string().trim().max(60).nullish(),
  city: z.string().trim().max(60).nullish(),
  state: z.string().trim().max(2).nullish(),
  cityCode: z.string().trim().max(10).nullish(),
  notes: z.string().trim().max(2000).nullish(),
});

function normalize(data: Partial<z.infer<typeof customerSchema>>) {
  const out: Record<string, unknown> = { ...data };
  if (data.document !== undefined) {
    const doc = onlyDigits(data.document);
    if (doc) {
      const type = documentType(doc);
      if (!type) throw Object.assign(new Error('CPF/CNPJ inválido'), { statusCode: 400 });
      out.document = doc;
      out.personType = type;
    } else out.document = null;
  }
  for (const k of ['phone', 'zipCode'] as const) if (data[k] !== undefined) out[k] = onlyDigits(data[k]) || null;
  if (data.email === '') out.email = null;
  if (data.state) out.state = data.state.toUpperCase();
  return out;
}

export async function customerRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/api/customers', async (req) => {
    const { search } = z.object({ search: z.string().optional() }).parse(req.query);
    const s = search?.trim();
    const digits = onlyDigits(s);
    return prisma.customer.findMany({
      where: s
        ? {
            OR: [
              { name: { contains: s, mode: 'insensitive' } },
              ...(digits ? [{ document: { contains: digits } }, { phone: { contains: digits } }] : []),
            ],
          }
        : {},
      include: { _count: { select: { orders: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  });

  app.get('/api/customers/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const c = await prisma.customer.findUnique({
      where: { id },
      include: { orders: { orderBy: { createdAt: 'desc' }, take: 50 }, contacts: true },
    });
    if (!c) return reply.code(404).send({ error: 'Cliente não encontrado' });
    return c;
  });

  app.post('/api/customers', async (req, reply) => {
    const data = normalize(customerSchema.parse(req.body));
    return reply.code(201).send(await prisma.customer.create({ data: data as never }));
  });

  app.patch('/api/customers/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const data = normalize(customerSchema.partial().parse(req.body));
    return prisma.customer.update({ where: { id }, data: data as never });
  });
}
