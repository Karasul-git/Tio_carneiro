import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fjwt from '@fastify/jwt';
import type { Role } from '@prisma/client';
import { config } from './config.js';

export type AuthUser = { sub: string; role: Role; name: string };

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function registerAuth(app: FastifyInstance) {
  await app.register(fjwt, { secret: config.JWT_SECRET, sign: { expiresIn: '7d' } });
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'Não autenticado' });
    }
  });
}

export const isManager = (u: AuthUser) => u.role === 'ADMIN' || u.role === 'GESTOR';

export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!roles.includes(req.user.role)) {
      reply.code(403).send({ error: 'Sem permissão' });
    }
  };
}

/** Filtro Prisma das conexões que o usuário pode ver. */
export function connectionScope(u: AuthUser) {
  return isManager(u) ? {} : { attendantId: u.sub };
}
