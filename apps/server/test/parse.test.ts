import { describe, expect, it } from 'vitest';
import { isIgnoredJid, parseMessage, phoneFromJid, previewText } from '../src/whatsapp/parse.js';

const base = (overrides: any = {}) => ({
  key: { id: 'ABC', remoteJid: '5511999998888@s.whatsapp.net', fromMe: false, ...(overrides.key ?? {}) },
  messageTimestamp: 1_700_000_000,
  pushName: 'Maria',
  message: overrides.message ?? { conversation: 'Olá, quero um orçamento' },
});

describe('parseMessage', () => {
  it('lê mensagem de texto do cliente', () => {
    const m = parseMessage(base() as any)!;
    expect(m).toMatchObject({
      waMessageId: 'ABC',
      jid: '5511999998888@s.whatsapp.net',
      phone: '5511999998888',
      fromMe: false,
      pushName: 'Maria',
      type: 'text',
      body: 'Olá, quero um orçamento',
    });
    expect(m.timestamp.getTime()).toBe(1_700_000_000_000);
  });

  it('lê texto estendido e legenda de imagem', () => {
    expect(parseMessage(base({ message: { extendedTextMessage: { text: 'link' } } }) as any)!.body).toBe('link');
    const img = parseMessage(base({ message: { imageMessage: { caption: 'essa estampa' } } }) as any)!;
    expect(img).toMatchObject({ type: 'image', body: 'essa estampa' });
  });

  it('mensagem enviada pelo celular do atendente não usa pushName', () => {
    const m = parseMessage(base({ key: { fromMe: true } }) as any)!;
    expect(m.fromMe).toBe(true);
    expect(m.pushName).toBeNull();
  });

  it('contato com LID usa o telefone alternativo', () => {
    const m = parseMessage(
      base({ key: { remoteJid: '123456789012345@lid', remoteJidAlt: '5511988887777@s.whatsapp.net' } }) as any,
    )!;
    expect(m.jid).toBe('123456789012345@lid');
    expect(m.phone).toBe('5511988887777');
  });

  it('ignora grupos, status e mensagens de protocolo', () => {
    expect(parseMessage(base({ key: { remoteJid: '123-456@g.us' } }) as any)).toBeNull();
    expect(parseMessage(base({ key: { remoteJid: 'status@broadcast' } }) as any)).toBeNull();
    expect(parseMessage(base({ message: { protocolMessage: { type: 0 } } }) as any)).toBeNull();
    expect(parseMessage(base({ message: { reactionMessage: { text: '👍' } } }) as any)).toBeNull();
  });
});

describe('helpers', () => {
  it('isIgnoredJid', () => {
    expect(isIgnoredJid('5511999998888@s.whatsapp.net')).toBe(false);
    expect(isIgnoredJid('1@newsletter')).toBe(true);
    expect(isIgnoredJid(undefined)).toBe(true);
  });
  it('phoneFromJid', () => {
    expect(phoneFromJid('5511999998888:12@s.whatsapp.net')).toBe('5511999998888');
    expect(phoneFromJid('123@lid')).toBeNull();
  });
  it('previewText', () => {
    expect(previewText('audio', null)).toBe('🎤 Áudio');
    expect(previewText('image', 'foto')).toBe('📷 Imagem: foto');
    expect(previewText('text', 'oi')).toBe('oi');
  });
});
