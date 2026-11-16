import { describe, expect, it } from 'vitest';
import { buildRuleSummary, extractDetails } from '../src/bot/summary.js';
import { isOpen } from '../src/bot/hours.js';
import { defaultBotSettings } from '../src/bot/settings.js';

describe('extração de detalhes', () => {
  it('quantidades, produtos, tamanhos, cores e prazo', () => {
    const d = extractDetails(['Preciso de 50 camisetas pretas e 20 moletons, tamanhos P M G GG', 'para até dia 20/12, urgente']);
    expect(d.items).toEqual(expect.arrayContaining(['50 camisetas', '20 moletons']));
    expect(d.sizes).toEqual(['P', 'M', 'G', 'GG']);
    expect(d.colors).toContain('preta');
    expect(d.deadline).toContain('até 20/12');
    expect(d.urgent).toBe(true);
  });

  it('detecta insatisfação', () => {
    expect(extractDetails(['Que absurdo, ninguém responde!!!']).unhappy).toBe(true);
    expect(extractDetails(['oi, tudo bem?']).unhappy).toBe(false);
  });

  it('monta o resumo', () => {
    const s = buildRuleSummary({
      intentLabel: 'Orçamento / pedido',
      customerMessages: ['Quero 30 uniformes azuis'],
      faqAnswered: [{ question: 'Qual o pedido mínimo?' }],
      suggestion: { question: 'Qual o prazo de produção?', confidence: 0.6 },
      handoffReason: 'detalhes coletados',
    });
    expect(s).toContain('📋 Orçamento / pedido');
    expect(s).toContain('30 uniformes');
    expect(s).toContain('azul');
    expect(s).toContain('"Qual o pedido mínimo?"');
    expect(s).toContain('(60%)');
  });
});

describe('horário de atendimento', () => {
  const hours = defaultBotSettings().businessHours;
  it('segunda 10h aberto, domingo fechado, sábado 13h fechado (horário de Brasília)', () => {
    expect(isOpen(hours, new Date('2026-11-16T13:00:00Z'))).toBe(true); // seg 10h BRT
    expect(isOpen(hours, new Date('2026-11-15T13:00:00Z'))).toBe(false); // dom
    expect(isOpen(hours, new Date('2026-11-21T16:00:00Z'))).toBe(false); // sáb 13h
    expect(isOpen(hours, new Date('2026-11-16T22:30:00Z'))).toBe(false); // seg 19h30
  });
});
