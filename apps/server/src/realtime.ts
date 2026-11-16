import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import { webOrigins } from './config.js';
import { prisma } from './db.js';
import type { AuthUser } from './auth.js';
import { logger } from './logger.js';

let io: Server | null = null;

export function setupRealtime(app: FastifyInstance) {
  io = new Server(app.server, { cors: { origin: webOrigins, credentials: true }, path: '/socket.io' });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Não autenticado'));
    try {
      socket.data.user = app.jwt.verify<AuthUser>(token);
      next();
    } catch {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as AuthUser;
    socket.join(`user:${user.sub}`);
    if (user.role === 'ADMIN' || user.role === 'GESTOR') socket.join('managers');
  });
}

/** Envia um evento para gestores e para o atendente responsável pela conexão. */
export async function emitToConnection(connectionId: string, event: string, payload: unknown) {
  if (!io) return;
  try {
    const conn = await prisma.whatsAppConnection.findUnique({
      where: { id: connectionId },
      select: { attendantId: true },
    });
    let target = io.to('managers');
    if (conn?.attendantId) target = target.to(`user:${conn.attendantId}`);
    target.emit(event, payload);
  } catch (err) {
    logger.warn({ err }, 'falha ao emitir evento em tempo real');
  }
}
