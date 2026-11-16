import { describe, expect, it } from 'vitest';
import { priorityScore, sortByPriority } from '../src/lib/priority.js';

const now = new Date('2026-01-01T12:00:00Z');
const minsAgo = (m: number) => new Date(now.getTime() - m * 60000);

describe('prioridade v1 (tempo de espera)', () => {
  it('quem espera há mais tempo vem primeiro; respondidas por último', () => {
    const items = [
      { id: 'respondida', awaitingSince: null, lastMessageAt: minsAgo(1) },
      { id: 'nova', awaitingSince: minsAgo(2), lastMessageAt: minsAgo(2) },
      { id: 'antiga', awaitingSince: minsAgo(90), lastMessageAt: minsAgo(1) },
      { id: 'respondida-antiga', awaitingSince: null, lastMessageAt: minsAgo(50) },
    ];
    expect(sortByPriority(items, now).map((i) => i.id)).toEqual([
      'antiga',
      'nova',
      'respondida',
      'respondida-antiga',
    ]);
  });

  it('acima do teto de pontuação, desempata pela espera mais antiga', () => {
    const items = [
      { id: 'b', awaitingSince: minsAgo(60 * 10), lastMessageAt: null },
      { id: 'a', awaitingSince: minsAgo(60 * 20), lastMessageAt: null },
    ];
    expect(sortByPriority(items, now).map((i) => i.id)).toEqual(['a', 'b']);
    expect(priorityScore(items[0], now)).toBe(1);
  });
});
