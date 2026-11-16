import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';

export const publicUser = { id: true, name: true, email: true, role: true, active: true } as const;

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user || !user.active || !(await bcrypt.compare(body.password, user.passwordHash))) {
      return reply.code(401).send({ error: 'E-mail ou senha inválidos' });
    }
    const token = app.jwt.sign({ sub: user.id, role: user.role, name: user.name });
    return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
  });

  app.get('/api/auth/me', { preHandler: app.authenticate }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub }, select: publicUser });
    if (!user || !user.active) return reply.code(401).send({ error: 'Usuário inativo' });
    return user;
  });
}
