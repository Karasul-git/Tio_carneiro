import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireRole } from '../auth.js';
import { publicUser } from './auth.js';

const roleSchema = z.enum(['ADMIN', 'GESTOR', 'ATENDENTE']);

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/api/users', { preHandler: requireRole('ADMIN', 'GESTOR') }, async () =>
    prisma.user.findMany({ select: publicUser, orderBy: { name: 'asc' } }),
  );

  app.post('/api/users', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(6),
        role: roleSchema.default('ATENDENTE'),
      })
      .parse(req.body);
    const email = body.email.toLowerCase();
    if (await prisma.user.findUnique({ where: { email } })) {
      return reply.code(409).send({ error: 'E-mail já cadastrado' });
    }
    const user = await prisma.user.create({
      data: { name: body.name, email, role: body.role, passwordHash: await bcrypt.hash(body.password, 10) },
      select: publicUser,
    });
    return reply.code(201).send(user);
  });

  app.patch('/api/users/:id', { preHandler: requireRole('ADMIN') }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        name: z.string().min(1).optional(),
        role: roleSchema.optional(),
        active: z.boolean().optional(),
        password: z.string().min(6).optional(),
      })
      .parse(req.body);
    const { password, ...rest } = body;
    return prisma.user.update({
      where: { id },
      data: { ...rest, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) },
      select: publicUser,
    });
  });
}
