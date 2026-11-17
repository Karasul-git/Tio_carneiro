/**
 * Prioridade dos atendimentos.
 *
 * Padrão (v1): só o tempo de espera conta — quem espera há mais tempo vem primeiro.
 * A gestão pode dar peso a outros critérios: cliente insatisfeito, urgente,
 * recorrente ou que compra muito. Cada critério vale de 0 a 1 vezes o seu peso.
 */
export type PriorityConfig = {
  waitingWeight: number;
  waitingCapMinutes: number;
  unhappyWeight: number;
  urgentWeight: number;
  recurringWeight: number;
  recurringMinOrders: number;
  bigCustomerWeight: number;
  bigCustomerMinCents: number;
};

export const defaultPriority: PriorityConfig = {
  waitingWeight: 1,
  waitingCapMinutes: 480,
  unhappyWeight: 0,
  urgentWeight: 0,
  recurringWeight: 0,
  recurringMinOrders: 2,
  bigCustomerWeight: 0,
  bigCustomerMinCents: 500000,
};

export type PriorityInput = {
  awaitingSince: Date | null;
  unhappy?: boolean;
  urgent?: boolean;
  /** Quantidade de pedidos do cliente (não cancelados) */
  customerOrders?: number;
  /** Total comprado pelo cliente nos últimos 12 meses, em centavos */
  customerSpentCents?: number;
};

export type PriorityReason = 'waiting' | 'unhappy' | 'urgent' | 'recurring' | 'bigCustomer';

export function priority(c: PriorityInput, now = new Date(), cfg: PriorityConfig = defaultPriority) {
  const reasons: PriorityReason[] = [];
  let score = 0;
  if (!c.awaitingSince) return { score, reasons };

  const minutes = Math.max(0, (now.getTime() - c.awaitingSince.getTime()) / 60000);
  score += cfg.waitingWeight * Math.min(minutes / cfg.waitingCapMinutes, 1);

  const add = (on: boolean | undefined, weight: number, reason: PriorityReason) => {
    if (on && weight > 0) {
      score += weight;
      reasons.push(reason);
    }
  };
  add(c.unhappy, cfg.unhappyWeight, 'unhappy');
  add(c.urgent, cfg.urgentWeight, 'urgent');
  add((c.customerOrders ?? 0) >= cfg.recurringMinOrders, cfg.recurringWeight, 'recurring');
  add((c.customerSpentCents ?? 0) >= cfg.bigCustomerMinCents && cfg.bigCustomerMinCents > 0, cfg.bigCustomerWeight, 'bigCustomer');
  return { score, reasons };
}

/** Compatibilidade: só a pontuação. */
export const priorityScore = (c: PriorityInput, now = new Date(), cfg: PriorityConfig = defaultPriority) =>
  priority(c, now, cfg).score;

/**
 * Ordena conversas: primeiro as que aguardam resposta (maior prioridade; empate =
 * espera mais antiga), depois as já respondidas pela última mensagem.
 */
export function sortByPriority<T extends PriorityInput & { lastMessageAt: Date | null }>(
  items: T[],
  now = new Date(),
  cfg: PriorityConfig = defaultPriority,
): T[] {
  const scores = new Map(items.map((i) => [i, priority(i, now, cfg).score]));
  return [...items].sort((a, b) => {
    const aw = a.awaitingSince ? 1 : 0;
    const bw = b.awaitingSince ? 1 : 0;
    if (aw !== bw) return bw - aw;
    if (aw) {
      const diff = scores.get(b)! - scores.get(a)!;
      if (Math.abs(diff) > 1e-9) return diff;
      return a.awaitingSince!.getTime() - b.awaitingSince!.getTime();
    }
    return (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0);
  });
}
