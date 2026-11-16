import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { emitToConnection } from '../realtime.js';
import { sendPushForConnection } from '../push.js';
import { conversationInclude } from '../whatsapp/ingest.js';
import { previewText } from '../whatsapp/parse.js';
import { whatsapp } from '../whatsapp/manager.js';
import { decide, type BotStateName, type Triage } from './engine.js';
import { isOpen } from './hours.js';
import { aiAvailable, summarizeWithAi, type TranscriptLine } from './llm.js';
import { KnowledgeIndex } from './matcher.js';
import { getBotSettings, type BotSettings } from './settings.js';
import { buildRuleSummary } from './summary.js';
import { sendOrderLink } from '../orders/service.js';

const BOT_ACTIVE: BotStateName[] = ['NONE', 'MENU', 'COLLECTING', 'FAQ'];

const INTENT_LABELS: Record<string, string> = {
  orcamento: 'Orçamento / pedido',
  pedido: 'Pedido',
  duvida: 'Dúvida',
  acompanhamento: 'Acompanhamento de pedido',
  atendente: 'Quer falar com atendente',
  troca: 'Troca / devolução',
  pagamento: 'Pagamento',
};

export function intentLabel(settings: BotSettings, intent: string | null) {
  if (!intent) return null;
  return INTENT_LABELS[intent] ?? settings.menu.find((o) => o.intent === intent)?.label ?? intent;
}

// ---------- Base de respostas em memória ----------
let index: KnowledgeIndex | null = null;

export function invalidateKnowledge() {
  index = null;
}

async function getIndex() {
  if (!index) {
    const items = await prisma.knowledgeItem.findMany({ where: { active: true } });
    index = new KnowledgeIndex(items);
  }
  return index;
}

/** Busca na base (usado pelo robô e pela tela de teste). */
export async function searchKnowledge(text: string, limit = 3) {
  return (await getIndex()).search(text, limit);
}

// ---------- Resumo ----------
export async function generateSummary(conversationId: string) {
  const settings = await getBotSettings();
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, include: { contact: true } });
  if (!conv) return null;
  const since = conv.sessionStartedAt ?? new Date(Date.now() - 24 * 3600_000);
  const messages = await prisma.message.findMany({
    where: { conversationId, timestamp: { gte: since } },
    orderBy: { timestamp: 'asc' },
    take: 80,
  });
  const triage = (conv.triage ?? {}) as Triage;
  const customerMessages = messages.filter((m) => !m.fromMe).map((m) => previewText(m.type, m.body));

  let summary = buildRuleSummary({
    intentLabel: intentLabel(settings, conv.intent),
    customerMessages,
    faqAnswered: triage.faq ?? [],
    suggestion: triage.suggestion ?? null,
    handoffReason: conv.handoffReason,
    outOfHours: triage.outOfHours,
  });

  if (settings.useAiSummary && aiAvailable()) {
    const transcript: TranscriptLine[] = messages.map((m) => ({
      from: !m.fromMe ? 'cliente' : m.sender === 'BOT' ? 'robô' : 'atendente',
      text: previewText(m.type, m.body),
    }));
    const ai = await summarizeWithAi(transcript, conv.contact.name);
    if (ai) {
      const extras = [
        triage.suggestion
          ? `Possível resposta na base: "${triage.suggestion.question}" (${Math.round(triage.suggestion.confidence * 100)}%)`
          : '',
        triage.outOfHours ? 'Chegou fora do horário' : '',
      ].filter(Boolean);
      summary = [ai, ...extras].join('\n');
    }
  }

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { summary, summaryUpdatedAt: new Date() },
    include: conversationInclude,
  });
  await emitToConnection(updated.connectionId, 'conversation:update', updated);
  return updated;
}

// ---------- Execução ----------
class BotRunner {
  private timers = new Map<string, NodeJS.Timeout>();
  private allow = new Map<string, boolean>();
  private locks = new Map<string, Promise<unknown>>();

  /** Agenda o processamento após uma pausa, para juntar mensagens enviadas em sequência. */
  async onCustomerMessage(conversationId: string, opts: { allowBot: boolean }) {
    const settings = await getBotSettings();
    const prevTimer = this.timers.get(conversationId);
    if (prevTimer) clearTimeout(prevTimer);
    this.allow.set(conversationId, (this.allow.get(conversationId) ?? false) || opts.allowBot);
    const timer = setTimeout(() => {
      this.timers.delete(conversationId);
      const allowBot = this.allow.get(conversationId) ?? false;
      this.allow.delete(conversationId);
      this.withLock(conversationId, () => this.process(conversationId, allowBot)).catch((err) =>
        logger.error({ err, conversationId }, 'falha no robô de triagem'),
      );
    }, settings.debounceSeconds * 1000);
    this.timers.set(conversationId, timer);
  }

  /** Uma pessoa respondeu: cancela qualquer resposta automática pendente. */
  cancel(conversationId: string) {
    const t = this.timers.get(conversationId);
    if (t) clearTimeout(t);
    this.timers.delete(conversationId);
    this.allow.delete(conversationId);
  }

  private withLock<T>(id: string, task: () => Promise<T>) {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const next = prev.then(task, task);
    this.locks.set(
      id,
      next.finally(() => {
        if (this.locks.get(id) === next) this.locks.delete(id);
      }).catch(() => {}),
    );
    return next;
  }

  private async load(conversationId: string) {
    return prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        contact: true,
        connection: { select: { id: true, name: true, botEnabled: true } },
      },
    });
  }

  private async process(conversationId: string, allowBot: boolean) {
    const conv = await this.load(conversationId);
    if (!conv) return;
    const settings = await getBotSettings();

    // Mensagens do cliente desde a última resposta (nossa ou do robô), dentro da sessão atual.
    // O horário do WhatsApp tem precisão de segundos; para "depois da última resposta"
    // usamos a ordem de gravação (createdAt).
    const lastOut = await prisma.message.findFirst({
      where: { conversationId, fromMe: true },
      orderBy: { createdAt: 'desc' },
    });
    const turn = await prisma.message.findMany({
      where: {
        conversationId,
        fromMe: false,
        ...(conv.sessionStartedAt ? { timestamp: { gte: conv.sessionStartedAt } } : {}),
        ...(lastOut ? { createdAt: { gt: lastOut.createdAt } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    if (turn.length === 0) return;
    const texts = turn.map((m) => previewText(m.type, m.body));
    const who = conv.contact.name || conv.contact.phone || 'Cliente';

    const botActive =
      allowBot &&
      settings.enabled &&
      conv.connection.botEnabled &&
      conv.status === 'OPEN' &&
      BOT_ACTIVE.includes(conv.botState as BotStateName);

    if (!botActive) {
      // Sem robô: avisa o atendente da mensagem, como na Fase 1
      await sendPushForConnection(conv.connectionId, {
        title: `${who} · ${conv.connection.name}`,
        body: texts.join(' / ').slice(0, 180),
        url: `/conversas/${conversationId}`,
        tag: conversationId,
      }).catch((err) => logger.warn({ err }, 'falha no push'));
      return;
    }

    const knowledge = await getIndex();
    const result = decide({
      settings,
      state: {
        botState: conv.botState as BotStateName,
        triage: (conv.triage ?? {}) as Triage,
        intent: conv.intent,
        botMessagesInSession: conv.botMessagesInSession,
      },
      text: texts.join('\n'),
      contactName: conv.contact.name,
      isOpen: isOpen(settings.businessHours),
      search: (t) => knowledge.search(t),
    });

    let handoffReason: string | null = null;
    let resolved = false;
    let sentCount = 0;
    for (const action of result.actions) {
      if (action.type === 'handoff') handoffReason = action.reason;
      if (action.type === 'resolved') resolved = true;
      if (action.type === 'orderLink') {
        try {
          await sendOrderLink(conversationId, { sender: 'BOT', template: action.text });
          sentCount++;
        } catch (err) {
          logger.warn({ err, conversationId }, 'robô não conseguiu enviar o link de pedido');
          handoffReason = 'falha ao enviar o link de pedido';
          result.state.botState = 'HANDOFF';
          break;
        }
        continue;
      }
      if (action.type !== 'send') continue;

      // O atendente pode ter respondido enquanto o robô "digitava"
      const fresh = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { botState: true } });
      if (fresh?.botState === 'HUMAN') return;
      try {
        await whatsapp.sendText(conv.connectionId, conv.contact.jid, action.text, {
          sender: 'BOT',
          meta: action.meta,
          typing: true,
        });
        sentCount++;
        if (action.meta?.faqId) {
          await prisma.knowledgeItem
            .update({ where: { id: String(action.meta.faqId) }, data: { hits: { increment: 1 } } })
            .catch(() => {});
        }
      } catch (err) {
        logger.warn({ err, conversationId }, 'robô não conseguiu enviar; passando para atendente');
        handoffReason = 'falha ao enviar resposta automática';
        resolved = false;
        result.state.botState = 'HANDOFF';
        break;
      }
    }

    // Se uma pessoa assumiu durante o processamento, não sobrescreve o estado
    const latest = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { botState: true } });
    if (latest?.botState === 'HUMAN') return;

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        botState: result.state.botState,
        triage: result.state.triage as Prisma.InputJsonValue,
        intent: result.state.intent,
        botMessagesInSession: conv.botMessagesInSession + sentCount,
        ...(resolved ? { awaitingSince: null, unreadCount: 0 } : {}),
        ...(handoffReason ? { handoffAt: new Date(), handoffReason } : {}),
      },
      include: conversationInclude,
    });
    await emitToConnection(conv.connectionId, 'conversation:update', updated);

    if (handoffReason) {
      const withSummary = (await generateSummary(conversationId)) ?? updated;
      const label = intentLabel(settings, withSummary.intent) ?? 'Novo atendimento';
      await sendPushForConnection(conv.connectionId, {
        title: `🔔 ${who} · ${label}`,
        body: (withSummary.summary ?? '').split('\n').slice(0, 4).join('\n').slice(0, 240),
        url: `/conversas/${conversationId}`,
        tag: conversationId,
      }).catch((err) => logger.warn({ err }, 'falha no push'));
    }
  }
}

export const botRunner = new BotRunner();
