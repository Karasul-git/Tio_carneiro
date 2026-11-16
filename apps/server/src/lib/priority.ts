/**
 * Prioridade dos atendimentos.
 *
 * v1: quem espera há mais tempo vem primeiro. A estrutura de regras com pesos
 * permite adicionar critérios futuros (cliente recorrente, volume de compras,
 * sentimento) configuráveis pela gestão.
 */
export type PriorityInput = {
  awaitingSince: Date | null;
};

export type PriorityRule = {
  id: string;
  label: string;
  enabled: boolean;
  weight: number;
  /** Retorna uma pontuação de 0 a 1 para a conversa */
  score: (c: PriorityInput, now: Date) => number;
};

/** Minutos de espera em que a pontuação de tempo atinge o máximo (8h). */
const WAIT_CAP_MINUTES = 8 * 60;

export const defaultRules: PriorityRule[] = [
  {
    id: 'waiting_time',
    label: 'Tempo de espera',
    enabled: true,
    weight: 1,
    score: (c, now) => {
      if (!c.awaitingSince) return 0;
      const minutes = (now.getTime() - c.awaitingSince.getTime()) / 60000;
      return Math.min(Math.max(minutes, 0) / WAIT_CAP_MINUTES, 1);
    },
  },
];

export function priorityScore(c: PriorityInput, now = new Date(), rules = defaultRules): number {
  return rules.filter((r) => r.enabled).reduce((sum, r) => sum + r.weight * r.score(c, now), 0);
}

/**
 * Ordena conversas: primeiro as que aguardam resposta (maior prioridade; empate =
 * espera mais antiga), depois as já respondidas pela última mensagem.
 */
export function sortByPriority<T extends PriorityInput & { lastMessageAt: Date | null }>(
  items: T[],
  now = new Date(),
  rules = defaultRules,
): T[] {
  return [...items].sort((a, b) => {
    const aw = a.awaitingSince ? 1 : 0;
    const bw = b.awaitingSince ? 1 : 0;
    if (aw !== bw) return bw - aw;
    if (aw) {
      const diff = priorityScore(b, now, rules) - priorityScore(a, now, rules);
      if (Math.abs(diff) > 1e-9) return diff;
      return a.awaitingSince!.getTime() - b.awaitingSince!.getTime();
    }
    return (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0);
  });
}
