/**
 * Motor de decisão do robô de triagem. É uma função pura: recebe o estado da
 * conversa e o que o cliente acabou de escrever, e devolve as ações a executar.
 * Não envia nada nem acessa o banco — isso fica com o runner.
 */
import type { Match } from './matcher.js';
import { normalizeText, tokenize } from './normalize.js';
import type { BotSettings, MenuOption } from './settings.js';

export type BotStateName = 'NONE' | 'MENU' | 'COLLECTING' | 'FAQ' | 'HANDOFF' | 'HUMAN';

export type Triage = {
  /** Opção do menu escolhida */
  option?: string;
  /** Mensagens do cliente com os detalhes pedidos */
  collected?: string[];
  /** Respostas da base enviadas pelo robô */
  faq?: { id: string; question: string; confidence: number }[];
  /** Melhor resposta encontrada, mas sem confiança para enviar sozinho */
  suggestion?: { id: string; question: string; answer: string; confidence: number } | null;
  /** Vezes seguidas em que o cliente não escolheu uma opção válida */
  notUnderstood?: number;
  outOfHours?: boolean;
};

export type EngineState = {
  botState: BotStateName;
  triage: Triage;
  intent: string | null;
  botMessagesInSession: number;
};

export type Action =
  | { type: 'send'; text: string; meta?: Record<string, unknown> }
  | { type: 'handoff'; reason: string }
  /** O robô resolveu a dúvida: a conversa sai da fila de espera */
  | { type: 'resolved' };

export type EngineInput = {
  settings: BotSettings;
  state: EngineState;
  /** Mensagens do cliente nesta rodada (desde a última resposta) */
  text: string;
  contactName: string | null;
  isOpen: boolean;
  search: (text: string) => Match[];
};

export type EngineOutput = { actions: Action[]; state: EngineState };

const WANTS_HUMAN = /\b(atendente|humano|humana|pessoa|alguem|vendedor|vendedora|falar com voces|ligar|ligacao)\b/;
const THANKS = /^(obrigad\w*|brigad\w*|valeu|vlw|ok|okay|blz|beleza|show|certo|perfeito|entendi|otimo|top|massa|tmj)\b/;

function firstName(name: string | null) {
  const first = name?.trim().split(/\s+/)[0];
  return first && /^\p{L}/u.test(first) ? first : '';
}

export function renderMenu(settings: BotSettings) {
  const options = settings.menu.map((o) => `*${o.key}* - ${o.label}`).join('\n');
  return `${settings.messages.menuIntro}\n\n${options}`;
}

/** Descobre a opção do menu pelo número ("2", "opção 2", "2.") ou por palavras-chave. */
export function pickOption(settings: BotSettings, text: string, allowKeywords: boolean): MenuOption | null {
  const t = normalizeText(text);
  const num = t.match(/^(?:opcao\s*|op\s*|numero\s*|n\s*)?(\d{1,2})\b/);
  if (num) {
    const byKey = settings.menu.find((o) => o.key === num[1]);
    if (byKey) return byKey;
  }
  if (!allowKeywords) return null;
  for (const o of settings.menu) {
    for (const k of o.keywords) {
      const nk = normalizeText(k);
      if (nk && ` ${t} `.includes(` ${nk} `)) return o;
    }
  }
  return null;
}

/** Opção escolhida: olha primeiro a última mensagem da rodada ("oi" + "1" → 1). */
function pickFromTurn(settings: BotSettings, text: string, allowKeywords: boolean) {
  const last = text.split('\n').pop() ?? text;
  return pickOption(settings, last, allowKeywords) ?? (last === text ? null : pickOption(settings, text, allowKeywords));
}

export function decide(input: EngineInput): EngineOutput {
  const { settings, text } = input;
  const state: EngineState = {
    ...input.state,
    triage: { ...input.state.triage, faq: [...(input.state.triage.faq ?? [])] },
  };
  const actions: Action[] = [];
  const norm = normalizeText(text);
  const words = tokenize(text);
  const msgs = settings.messages;
  let sends = 0;

  const send = (t: string, meta?: Record<string, unknown>) => {
    actions.push({ type: 'send', text: t, ...(meta ? { meta } : {}) });
    sends++;
  };
  const budgetLeft = () => settings.maxBotMessagesPerSession - state.botMessagesInSession - sends;
  const done = () => {
    state.botMessagesInSession += sends;
    return { actions, state };
  };
  const handoff = (reason: string, withMessage = true) => {
    if (withMessage && budgetLeft() > 0) send(input.isOpen ? msgs.handoff : msgs.handoffOutOfHours);
    actions.push({ type: 'handoff', reason });
    state.botState = 'HANDOFF';
    return done();
  };
  const top = () => input.search(text)[0] ?? null;
  const answer = (m: Match, prefix = '') => {
    send(`${prefix}${m.item.answer}\n\n${msgs.faqFollowUp}`, {
      faqId: m.item.id,
      confidence: m.confidence,
    });
    state.triage.faq!.push({ id: m.item.id, question: m.item.question, confidence: m.confidence });
    state.triage.suggestion = null;
    state.botState = 'FAQ';
    state.intent = state.intent ?? 'duvida';
    actions.push({ type: 'resolved' });
    return done();
  };
  const startOption = (o: MenuOption, prefix = '') => {
    state.triage.option = o.key;
    state.intent = o.intent;
    if (o.action === 'handoff') {
      if (prefix) send(prefix.trim());
      return handoff('cliente escolheu falar com atendente');
    }
    state.botState = o.action === 'faq' ? 'FAQ' : 'COLLECTING';
    send(`${prefix}${o.prompt || (o.action === 'faq' ? 'Qual é a sua dúvida?' : 'Pode me contar mais detalhes?')}`);
    return done();
  };

  // Atendente já assumiu ou já foi chamado: o robô não fala mais nesta sessão.
  if (state.botState === 'HUMAN' || state.botState === 'HANDOFF') return { actions, state };

  // Proteção contra excesso de mensagens automáticas
  if (budgetLeft() <= 0) return handoff('limite de mensagens do robô atingido', false);

  if (WANTS_HUMAN.test(norm)) {
    state.intent = state.intent ?? 'atendente';
    return handoff('cliente pediu para falar com uma pessoa');
  }

  switch (state.botState) {
    case 'NONE': {
      const name = firstName(input.contactName);
      let greet = msgs.welcome.replace('{nome}', name ? `, ${name}` : '');
      if (!input.isOpen) {
        greet += `\n\n${msgs.outOfHours}`;
        state.triage.outOfHours = true;
      }
      greet += '\n\n';

      // Primeira mensagem já é uma dúvida que a base responde bem
      if (settings.answerFirstMessage && words.length >= 1) {
        const m = top();
        if (m && m.confidence >= settings.autoAnswerThreshold) return answer(m, greet);
      }
      // Primeira mensagem já diz o assunto ("quero um orçamento de 50 camisetas")
      const o = pickFromTurn(settings, text, true);
      if (o) {
        if (o.action === 'collect' && words.length >= 5) {
          // Já veio com detalhes: registra e passa direto para o atendente
          state.triage.option = o.key;
          state.intent = o.intent;
          state.triage.collected = [text];
          send(greet.trim());
          return handoff('pedido com detalhes na primeira mensagem');
        }
        return startOption(o, greet);
      }
      state.botState = 'MENU';
      send(greet + renderMenu(settings));
      return done();
    }

    case 'MENU': {
      const o = pickFromTurn(settings, text, true);
      if (o) return startOption(o);
      const m = top();
      if (m && m.confidence >= settings.autoAnswerThreshold) return answer(m);
      const n = (state.triage.notUnderstood ?? 0) + 1;
      state.triage.notUnderstood = n;
      if (n >= 2) return handoff('cliente não escolheu uma opção do menu');
      send(`${msgs.notUnderstood}\n\n${settings.menu.map((op) => `*${op.key}* - ${op.label}`).join('\n')}`);
      return done();
    }

    case 'COLLECTING': {
      state.triage.collected = [...(state.triage.collected ?? []), text];
      return handoff('detalhes coletados');
    }

    case 'FAQ': {
      if (THANKS.test(norm) && words.length <= 3) {
        send('Por nada! Qualquer coisa é só chamar. 😊');
        actions.push({ type: 'resolved' });
        return done();
      }
      // Cliente mudou de assunto pelo número do menu
      const o = pickFromTurn(settings, text, false);
      if (o) return startOption(o);
      const m = top();
      if (m && m.confidence >= settings.autoAnswerThreshold) return answer(m);
      if (m && m.confidence >= settings.suggestThreshold) {
        state.triage.suggestion = {
          id: m.item.id,
          question: m.item.question,
          answer: m.item.answer,
          confidence: m.confidence,
        };
        return handoff('dúvida com resposta incerta na base');
      }
      return handoff('dúvida sem resposta na base');
    }
  }
  return { actions, state };
}
