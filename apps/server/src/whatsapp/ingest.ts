import { Prisma, type MessageSender } from '@prisma/client';
import type { WAMessage } from 'baileys';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { applyMessage } from '../lib/conversation-state.js';
import { emitToConnection } from '../realtime.js';
import { sendPushForConnection } from '../push.js';
import { parseMessage, previewText, type ParsedMessage } from './parse.js';

/** Mensagens do histórico mais antigas que isso não entram na fila de espera. */
const HISTORY_AWAIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export type IngestOptions = {
  /** Enviar notificação push para mensagens de clientes */
  notify: boolean;
  /** Mensagens vindas da sincronização de histórico */
  history?: boolean;
  /** Sobrescreve o remetente (ex.: mensagem enviada pelo painel) */
  sender?: MessageSender;
  sentByUserId?: string;
};

// Fila por conexão para processar mensagens em ordem e evitar condições de corrida.
const queues = new Map<string, Promise<unknown>>();

function enqueue<T>(connectionId: string, task: () => Promise<T>): Promise<T> {
  const prev = queues.get(connectionId) ?? Promise.resolve();
  const next = prev.then(task, task);
  queues.set(
    connectionId,
    next.catch(() => {}),
  );
  return next;
}

export function ingestMessages(connectionId: string, messages: WAMessage[], opts: IngestOptions) {
  const parsed = messages
    .map((m) => {
      try {
        return parseMessage(m);
      } catch (err) {
        logger.warn({ err }, 'mensagem não reconhecida');
        return null;
      }
    })
    .filter((m): m is ParsedMessage => m !== null)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (parsed.length === 0) return Promise.resolve([]);
  return enqueue(connectionId, async () => {
    const saved: string[] = [];
    for (const msg of parsed) {
      try {
        const id = await ingestOne(connectionId, msg, opts);
        if (id) saved.push(id);
      } catch (err) {
        logger.error({ err, connectionId }, 'falha ao salvar mensagem');
      }
    }
    return saved;
  });
}

async function ingestOne(connectionId: string, msg: ParsedMessage, opts: IngestOptions) {
  const contact = await prisma.contact.upsert({
    where: { connectionId_jid: { connectionId, jid: msg.jid } },
    create: { connectionId, jid: msg.jid, phone: msg.phone, name: msg.pushName },
    update: {
      ...(msg.pushName ? { name: msg.pushName } : {}),
      ...(msg.phone ? { phone: msg.phone } : {}),
    },
  });

  const conversation = await prisma.conversation.upsert({
    where: { connectionId_contactId: { connectionId, contactId: contact.id } },
    create: { connectionId, contactId: contact.id },
    update: {},
  });

  const sender: MessageSender = opts.sender ?? (msg.fromMe ? 'ATTENDANT_PHONE' : 'CUSTOMER');

  let message;
  try {
    message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        waMessageId: msg.waMessageId,
        fromMe: msg.fromMe,
        sender,
        sentByUserId: opts.sentByUserId,
        type: msg.type,
        body: msg.body,
        timestamp: msg.timestamp,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      // Já registrada (eco do envio). Se veio do painel, corrige o remetente.
      if (opts.sender) {
        await prisma.message.update({
          where: { conversationId_waMessageId: { conversationId: conversation.id, waMessageId: msg.waMessageId } },
          data: { sender: opts.sender, sentByUserId: opts.sentByUserId },
        });
      }
      return null;
    }
    throw err;
  }

  const next = applyMessage(conversation, { fromMe: msg.fromMe, timestamp: msg.timestamp });
  if (
    opts.history &&
    next.awaitingSince &&
    Date.now() - next.awaitingSince.getTime() > HISTORY_AWAIT_WINDOW_MS
  ) {
    next.awaitingSince = null;
    next.unreadCount = 0;
  }
  const isNewest = next.lastMessageAt?.getTime() === msg.timestamp.getTime();

  const updated = await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      awaitingSince: next.awaitingSince,
      lastMessageAt: next.lastMessageAt,
      unreadCount: next.unreadCount,
      ...(isNewest ? { lastMessageText: previewText(msg.type, msg.body) } : {}),
      // Cliente voltou a falar: reabre a conversa
      ...(!msg.fromMe && isNewest ? { status: 'OPEN' as const } : {}),
    },
    include: { contact: true, connection: { select: { id: true, name: true } } },
  });

  await emitToConnection(connectionId, 'message:new', { conversationId: conversation.id, message });
  await emitToConnection(connectionId, 'conversation:update', updated);

  if (opts.notify && !msg.fromMe && !opts.history) {
    const who = contact.name || contact.phone || 'Cliente';
    sendPushForConnection(connectionId, {
      title: `${who} · ${updated.connection.name}`,
      body: previewText(msg.type, msg.body),
      url: `/conversas/${conversation.id}`,
      tag: conversation.id,
    }).catch((err) => logger.warn({ err }, 'falha no push'));
  }

  return message.id;
}
