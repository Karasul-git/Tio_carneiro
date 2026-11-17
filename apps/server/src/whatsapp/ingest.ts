import { Prisma, type MessageSender } from '@prisma/client';
import type { WAMessage } from 'baileys';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { applyMessage } from '../lib/conversation-state.js';
import { emitToConnection } from '../realtime.js';
import { getBotSettings } from '../bot/settings.js';
import { extractDetails } from '../bot/summary.js';
import { parseMessage, previewText, type ParsedMessage } from './parse.js';

/** Mensagens do histórico mais antigas que isso não entram na fila de espera. */
const HISTORY_AWAIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export type IngestOptions = {
  /** Mensagens ao vivo (true) ou vindas de sincronização/eco (false) */
  live: boolean;
  /** Mensagens vindas da sincronização de histórico */
  history?: boolean;
};

export type IngestedMessage = {
  conversationId: string;
  messageId: string;
  waMessageId: string;
  fromMe: boolean;
  sender: MessageSender;
};

export const conversationInclude = {
  contact: true,
  connection: { select: { id: true, name: true } },
} as const;

/**
 * Envios feitos pelo sistema (painel ou robô) aguardando o eco do WhatsApp.
 * Registrar antes de enviar evita confundir o eco com uma resposta pelo celular.
 */
type Outgoing = { sender: MessageSender; sentByUserId?: string; meta?: Record<string, unknown> };
const outgoing = new Map<string, Outgoing>();

export function registerOutgoing(waMessageId: string, info: Outgoing) {
  outgoing.set(waMessageId, info);
  setTimeout(() => outgoing.delete(waMessageId), 5 * 60_000).unref?.();
}

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

export function ingestMessages(
  connectionId: string,
  messages: WAMessage[],
  opts: IngestOptions,
): Promise<IngestedMessage[]> {
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
    const saved: IngestedMessage[] = [];
    for (const msg of parsed) {
      try {
        const result = await ingestOne(connectionId, msg, opts);
        if (result) saved.push(result);
      } catch (err) {
        logger.error({ err, connectionId }, 'falha ao salvar mensagem');
      }
    }
    return saved;
  });
}

async function ingestOne(
  connectionId: string,
  msg: ParsedMessage,
  opts: IngestOptions,
): Promise<IngestedMessage | null> {
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

  const pending = msg.fromMe ? outgoing.get(msg.waMessageId) : undefined;
  if (pending) outgoing.delete(msg.waMessageId);
  const sender: MessageSender = pending?.sender ?? (msg.fromMe ? 'ATTENDANT_PHONE' : 'CUSTOMER');

  let message;
  try {
    message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        waMessageId: msg.waMessageId,
        fromMe: msg.fromMe,
        sender,
        sentByUserId: pending?.sentByUserId,
        type: msg.type,
        body: msg.body,
        timestamp: msg.timestamp,
        meta: (pending?.meta as Prisma.InputJsonValue) ?? undefined,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
    throw err;
  }

  const isBot = sender === 'BOT';
  const isHuman = msg.fromMe && !isBot;
  const next = applyMessage(conversation, { fromMe: msg.fromMe, timestamp: msg.timestamp, byBot: isBot });
  if (opts.history && next.awaitingSince && Date.now() - next.awaitingSince.getTime() > HISTORY_AWAIT_WINDOW_MS) {
    next.awaitingSince = null;
    next.unreadCount = 0;
  }
  const isNewest = next.lastMessageAt?.getTime() === msg.timestamp.getTime();

  // Sessão de atendimento: uma nova começa quando o cliente volta depois de um tempo
  // sem conversa (ou com a conversa encerrada). O robô recomeça a triagem.
  const session: Prisma.ConversationUpdateInput = {};
  if (opts.live && !msg.fromMe && isNewest) {
    const settings = await getBotSettings();
    const gapMs = settings.sessionGapHours * 3600_000;
    const prev = conversation.lastMessageAt;
    const isNewSession =
      !conversation.sessionStartedAt ||
      conversation.status === 'CLOSED' ||
      !prev ||
      msg.timestamp.getTime() - prev.getTime() > gapMs;
    if (isNewSession) {
      Object.assign(session, {
        sessionStartedAt: msg.timestamp,
        botState: 'NONE',
        botMessagesInSession: 0,
        intent: null,
        summary: null,
        summaryUpdatedAt: null,
        handoffAt: null,
        handoffReason: null,
        triage: Prisma.DbNull,
      });
    }
  }
  // Uma pessoa respondeu (celular ou painel): o robô fica quieto nesta sessão.
  if (opts.live && isHuman && isNewest) {
    Object.assign(session, {
      botState: 'HUMAN',
      ...(conversation.sessionStartedAt ? {} : { sessionStartedAt: msg.timestamp }),
    });
  }

  // Sinais de prioridade: valem enquanto o cliente espera resposta
  const signals: Prisma.ConversationUpdateInput = {};
  if (!next.awaitingSince) {
    if (conversation.unhappy || conversation.urgent) Object.assign(signals, { unhappy: false, urgent: false });
  } else if (!msg.fromMe && msg.body && opts.live) {
    const d = extractDetails([msg.body]);
    if (d.unhappy && !conversation.unhappy) signals.unhappy = true;
    if (d.urgent && !conversation.urgent) signals.urgent = true;
  }

  const updated = await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      ...signals,
      awaitingSince: next.awaitingSince,
      lastMessageAt: next.lastMessageAt,
      unreadCount: next.unreadCount,
      ...(isNewest ? { lastMessageText: previewText(msg.type, msg.body) } : {}),
      // Cliente voltou a falar: reabre a conversa
      ...(!msg.fromMe && isNewest ? { status: 'OPEN' as const } : {}),
      ...session,
    },
    include: conversationInclude,
  });

  await emitToConnection(connectionId, 'message:new', { conversationId: conversation.id, message });
  await emitToConnection(connectionId, 'conversation:update', updated);

  return { conversationId: conversation.id, messageId: message.id, waMessageId: msg.waMessageId, fromMe: msg.fromMe, sender };
}
