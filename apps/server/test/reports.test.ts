import { describe, expect, it } from 'vitest';
import { dayKey, daysBetween, durationStats, responseEpisodes } from '../src/reports/metrics.js';

const t = (min: number) => new Date(Date.UTC(2026, 0, 5, 12, min));

describe('tempo de resposta', () => {
  it('mede da primeira mensagem do cliente até a resposta de uma pessoa (robô não conta)', () => {
    const e = responseEpisodes([
      { timestamp: t(0), fromMe: false, sender: 'CUSTOMER' },
      { timestamp: t(1), fromMe: false, sender: 'CUSTOMER' },
      { timestamp: t(2), fromMe: true, sender: 'BOT' },
      { timestamp: t(12), fromMe: true, sender: 'ATTENDANT_PHONE' },
      { timestamp: t(13), fromMe: true, sender: 'PANEL' },
      { timestamp: t(30), fromMe: false, sender: 'CUSTOMER' },
    ]);
    expect(e).toHaveLength(2);
    expect(e[0].minutes).toBe(12);
    expect(e[1]).toMatchObject({ start: t(30), end: null, minutes: null });
  });

  it('estatísticas: mediana, média, p90 e % em até 15 min', () => {
    expect(durationStats([5, 10, 20, 60])).toEqual({ count: 4, medianMinutes: 15, averageMinutes: 23.8, p90Minutes: 48, withinPct: 50 });
    expect(durationStats([]).medianMinutes).toBeNull();
  });
});

describe('dias no fuso de Brasília', () => {
  it('23h de Brasília ainda é o mesmo dia', () => {
    expect(dayKey(new Date('2026-01-06T01:30:00Z'))).toBe('2026-01-05');
  });
  it('lista todos os dias do período', () => {
    const from = new Date('2026-01-01T00:00:00-03:00');
    const to = new Date('2026-01-07T23:59:59-03:00');
    expect(daysBetween(from, to)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07']);
  });
});
