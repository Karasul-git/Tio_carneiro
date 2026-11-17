import { describe, expect, it } from 'vitest';
import { decide, pickOption, type EngineState } from '../src/bot/engine.js';
import { KnowledgeIndex } from '../src/bot/matcher.js';
import { defaultBotSettings } from '../src/bot/settings.js';
import { faqExemplos } from '../src/data/faq-exemplos.js';

const settings = { ...defaultBotSettings(), enabled: true };
const index = new KnowledgeIndex(faqExemplos.map((f, i) => ({ id: String(i), ...f })));
const fresh: EngineState = { botState: 'NONE', triage: {}, intent: null, botMessagesInSession: 0 };

const run = (text: string, state: EngineState = fresh, extra: Partial<Parameters<typeof decide>[0]> = {}) =>
  decide({ settings, state, text, contactName: 'Joana Silva', isOpen: true, search: (t) => index.search(t), ...extra });

const sends = (r: ReturnType<typeof decide>) => r.actions.filter((a) => a.type === 'send').map((a: any) => a.text as string);
const has = (r: ReturnType<typeof decide>, type: string) => r.actions.some((a) => a.type === type);

describe('robô de triagem', () => {
  it('primeira mensagem genérica: cumprimenta pelo nome e mostra o menu', () => {
    const r = run('Oi, boa tarde');
    expect(r.state.botState).toBe('MENU');
    const [msg] = sends(r);
    expect(msg).toContain('Olá, Joana!');
    expect(msg).toContain('*1* - Fazer orçamento ou pedido');
    expect(sends(r)).toHaveLength(1); // uma mensagem só (menos risco de bloqueio)
  });

  it('fora do horário avisa e marca na triagem', () => {
    const r = run('Oi', fresh, { isOpen: false });
    expect(sends(r)[0]).toContain('fora do horário');
    expect(r.state.triage.outOfHours).toBe(true);
  });

  it('primeira mensagem que a base responde bem: responde direto e resolve', () => {
    const r = run('Boa tarde! Qual o pedido mínimo de vocês?');
    expect(r.state.botState).toBe('FAQ');
    expect(sends(r)[0]).toContain('pedido mínimo');
    expect(has(r, 'resolved')).toBe(true);
    expect(r.state.triage.faq?.[0].question).toBe('Qual o pedido mínimo?');
  });

  it('pedido já detalhado na primeira mensagem vai direto ao atendente', () => {
    const r = run('Quero fazer um orçamento de 50 camisetas pretas tamanho M e G para dia 20/12');
    expect(r.state.botState).toBe('HANDOFF');
    expect(r.state.intent).toBe('orcamento');
    expect(r.state.triage.collected).toHaveLength(1);
    expect(has(r, 'handoff')).toBe(true);
  });

  it('menu → orçamento → detalhes → passa ao atendente', () => {
    let r = run('oi');
    r = run('1', r.state);
    expect(r.state.botState).toBe('COLLECTING');
    expect(sends(r)[0]).toContain('quantidade');
    r = run('100 camisetas brancas com logo, P M G', r.state);
    expect(r.state.botState).toBe('HANDOFF');
    expect(r.actions.find((a) => a.type === 'handoff')).toMatchObject({ reason: 'detalhes coletados' });
  });

  it('menu → dúvidas → resposta com confiança → depois sem resposta na base', () => {
    let r = run('olá');
    r = run('2', r.state);
    expect(r.state.botState).toBe('FAQ');
    r = run('aceita pix?', r.state);
    expect(sends(r)[0]).toContain('Pix');
    expect(has(r, 'resolved')).toBe(true);
    r = run('vocês consertam máquina de costura?', r.state);
    expect(r.state.botState).toBe('HANDOFF');
    expect(r.actions.find((a) => a.type === 'handoff')).toMatchObject({ reason: 'dúvida sem resposta na base' });
  });

  it('agradecimento depois da resposta encerra educadamente', () => {
    let r = run('qual o endereço?');
    r = run('obrigada!', r.state);
    expect(sends(r)[0]).toContain('Por nada');
    expect(r.state.botState).toBe('FAQ');
  });

  it('pedir atendente em qualquer momento passa ao humano', () => {
    let r = run('oi');
    r = run('quero falar com um atendente', r.state);
    expect(r.state.botState).toBe('HANDOFF');
  });

  it('não entendeu o menu duas vezes: passa ao atendente', () => {
    let r = run('oi');
    r = run('hmm', r.state);
    expect(r.state.botState).toBe('MENU');
    expect(sends(r)[0]).toContain('não entendi');
    r = run('sei lá', r.state);
    expect(r.state.botState).toBe('HANDOFF');
  });

  it('fica quieto quando o atendente já assumiu', () => {
    const r = run('oi?', { ...fresh, botState: 'HUMAN' });
    expect(r.actions).toEqual([]);
  });

  it('respeita o limite de mensagens do robô', () => {
    const r = run('hmm', { ...fresh, botState: 'MENU', botMessagesInSession: settings.maxBotMessagesPerSession });
    expect(sends(r)).toHaveLength(0);
    expect(r.state.botState).toBe('HANDOFF');
  });

  it('pickOption entende número e palavra-chave', () => {
    expect(pickOption(settings, 'opção 3', false)?.intent).toBe('acompanhamento');
    expect(pickOption(settings, '2.', false)?.intent).toBe('duvida');
    expect(pickOption(settings, 'quero um orçamento', true)?.intent).toBe('orcamento');
    expect(pickOption(settings, 'quero um orçamento', false)).toBeNull();
  });
});

describe('rodada com várias mensagens', () => {
  it('"oi" seguido de "1" escolhe a opção 1', () => {
    const r = decide({
      settings,
      state: fresh,
      text: 'Oi, boa tarde\n1',
      contactName: null,
      isOpen: true,
      search: (t) => index.search(t),
    });
    expect(r.state.botState).toBe('COLLECTING');
    expect(r.state.intent).toBe('orcamento');
  });
});

describe('passagem fora do horário', () => {
  it('não promete resposta imediata', () => {
    const r = decide({ settings, state: { ...fresh, botState: 'COLLECTING' }, text: '20 camisetas', contactName: null, isOpen: false, search: (t) => index.search(t) });
    const msg = (r.actions.find((a) => a.type === 'send') as any).text;
    expect(msg).toContain('assim que voltarmos');
  });
});

describe('opção de menu que envia o link de pedido', () => {
  it('envia o link e passa ao atendente', () => {
    const s = { ...settings, menu: settings.menu.map((o) => (o.key === '1' ? { ...o, action: 'order' as const, prompt: 'Monte aqui: {link}' } : o)) };
    const r = decide({ settings: s, state: { ...fresh, botState: 'MENU' }, text: '1', contactName: null, isOpen: true, search: () => [] });
    expect(r.actions).toContainEqual({ type: 'orderLink', text: 'Monte aqui: {link}' });
    expect(r.state.botState).toBe('HANDOFF');
    expect(r.state.botMessagesInSession).toBe(1);
  });
});

describe('palavras-chave e cliente insatisfeito', () => {
  it('a palavra-chave mais específica vence', () => {
    expect(pickOption(settings, 'quero saber do meu pedido', true)?.intent).toBe('acompanhamento');
    expect(pickOption(settings, 'quero fazer um pedido', true)?.intent).toBe('orcamento');
  });

  it('cliente irritado vai direto para o atendente, com o assunto', () => {
    const r = decide({ settings, state: fresh, text: 'Que absurdo, ninguém responde!!! Meu pedido atrasou', contactName: null, isOpen: true, search: () => [] });
    expect(r.state.botState).toBe('HANDOFF');
    expect(r.state.intent).toBe('acompanhamento');
    expect(r.actions).toContainEqual({ type: 'handoff', reason: 'cliente parece insatisfeito' });
  });
});
