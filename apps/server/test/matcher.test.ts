import { describe, expect, it } from 'vitest';
import { KnowledgeIndex } from '../src/bot/matcher.js';
import { stem, tokenize } from '../src/bot/normalize.js';
import { faqExemplos } from '../src/data/faq-exemplos.js';

const index = new KnowledgeIndex(faqExemplos.map((f, i) => ({ id: String(i), ...f })));
const top = (q: string) => index.search(q)[0];

describe('normalização', () => {
  it('remove acentos, palavras vazias e plural', () => {
    expect(tokenize('Quais são as formas de pagamento?')).toEqual(['form', 'pagament']);
    expect(stem('camisetas')).toBe(stem('camiseta'));
    expect(stem('promocoes')).toBe(stem('promocao'));
    expect(stem('entregam')).toBe(stem('entrega'));
  });
});

describe('busca na base de respostas', () => {
  const cases: [string, string][] = [
    ['qual o pedido minimo de vcs?', 'Qual o pedido mínimo?'],
    ['Oi, aceita pix?', 'Quais as formas de pagamento?'],
    ['quanto tempo demora pra ficar pronto?', 'Qual o prazo de produção?'],
    ['vcs entregam em outra cidade? qual o frete', 'Vocês entregam ou enviam pelo correio?'],
    ['Qual o endereço de vocês?', 'Onde fica a loja?'],
    ['vocês fazem uniforme com o logo da empresa?', 'Vocês fazem camiseta personalizada?'],
    ['qual o horario de funcionamento no sabado', 'Qual o horário de atendimento?'],
    ['a peça veio com defeito, como faço a troca', 'Como funciona a troca?'],
  ];
  it.each(cases)('"%s" → %s (confiança alta)', (q, expected) => {
    const m = top(q);
    expect(m.item.question).toBe(expected);
    expect(m.confidence).toBeGreaterThanOrEqual(0.72);
  });

  it('tolera erros de digitação', () => {
    const m = top('qual o pedidu minimo');
    expect(m.item.question).toBe('Qual o pedido mínimo?');
    expect(m.confidence).toBeGreaterThan(0.45);
  });

  it('assunto fora da base fica com confiança baixa', () => {
    const m = top('vocês consertam máquina de lavar?');
    expect(m?.confidence ?? 0).toBeLessThan(0.45);
  });

  it('mensagem só com cumprimento não encontra nada', () => {
    expect(index.search('oi, bom dia!')).toEqual([]);
  });
});
