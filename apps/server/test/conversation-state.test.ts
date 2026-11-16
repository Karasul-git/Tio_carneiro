import { describe, expect, it } from 'vitest';
import { applyMessage, type ConversationState } from '../src/lib/conversation-state.js';

const t = (min: number) => new Date(Date.UTC(2026, 0, 1, 12, min));
const empty: ConversationState = { awaitingSince: null, lastMessageAt: null, unreadCount: 0 };

describe('applyMessage', () => {
  it('mensagem do cliente inicia a espera', () => {
    const s = applyMessage(empty, { fromMe: false, timestamp: t(0) });
    expect(s).toEqual({ awaitingSince: t(0), lastMessageAt: t(0), unreadCount: 1 });
  });

  it('várias mensagens mantêm o início da espera na primeira', () => {
    let s = applyMessage(empty, { fromMe: false, timestamp: t(0) });
    s = applyMessage(s, { fromMe: false, timestamp: t(5) });
    expect(s.awaitingSince).toEqual(t(0));
    expect(s.unreadCount).toBe(2);
  });

  it('resposta do atendente (celular ou painel) encerra a espera', () => {
    let s = applyMessage(empty, { fromMe: false, timestamp: t(0) });
    s = applyMessage(s, { fromMe: true, timestamp: t(3) });
    expect(s).toEqual({ awaitingSince: null, lastMessageAt: t(3), unreadCount: 0 });
  });

  it('mensagem antiga fora de ordem não reabre a espera', () => {
    let s = applyMessage(empty, { fromMe: false, timestamp: t(0) });
    s = applyMessage(s, { fromMe: true, timestamp: t(10) });
    s = applyMessage(s, { fromMe: false, timestamp: t(5) });
    expect(s.awaitingSince).toBeNull();
    expect(s.lastMessageAt).toEqual(t(10));
  });

  it('resposta antiga não encerra uma espera mais nova', () => {
    let s = applyMessage(empty, { fromMe: false, timestamp: t(10) });
    s = applyMessage(s, { fromMe: true, timestamp: t(5) });
    expect(s.awaitingSince).toEqual(t(10));
  });
});
