/**
 * Decide quais conversas precisam de lembrete agora. Função pura (testável):
 * o agendador busca os dados, chama esta função e envia as notificações.
 */
export type ReminderConfig = {
  firstAfterMinutes: number;
  repeatEveryMinutes: number;
  maxReminders: number;
  escalateToManagersAt: number;
  triageStuckMinutes: number;
};

export type ReminderCandidate = {
  id: string;
  awaitingSince: Date | null;
  /** Robô ainda conversando com o cliente */
  inBotTriage: boolean;
  /** Última atividade da conversa (para saber se a triagem travou) */
  lastMessageAt: Date | null;
  reminderFor: Date | null;
  remindersSent: number;
  lastReminderAt: Date | null;
  snoozedUntil: Date | null;
};

export type ReminderDue = {
  id: string;
  /** Número deste lembrete (1, 2, 3...) */
  nth: number;
  waitingMinutes: number;
  escalate: boolean;
};

export function dueReminders(list: ReminderCandidate[], cfg: ReminderConfig, now = new Date()): ReminderDue[] {
  const out: ReminderDue[] = [];
  for (const c of list) {
    if (!c.awaitingSince) continue;
    if (c.snoozedUntil && c.snoozedUntil > now) continue;
    // Robô atendendo: só lembra se a triagem estiver parada há muito tempo
    if (c.inBotTriage) {
      const idle = c.lastMessageAt ? (now.getTime() - c.lastMessageAt.getTime()) / 60000 : Infinity;
      if (idle < cfg.triageStuckMinutes) continue;
    }
    // Lembretes contados por espera: uma nova espera zera a contagem
    const sent = c.reminderFor && c.reminderFor.getTime() === c.awaitingSince.getTime() ? c.remindersSent : 0;
    if (sent >= cfg.maxReminders) continue;

    const waitingMinutes = (now.getTime() - c.awaitingSince.getTime()) / 60000;
    if (sent === 0) {
      // Primeiro lembrete: conta desde o início da espera (ou do fim do adiamento)
      const start = c.snoozedUntil && c.snoozedUntil > c.awaitingSince ? c.snoozedUntil : c.awaitingSince;
      if ((now.getTime() - start.getTime()) / 60000 < cfg.firstAfterMinutes) continue;
    } else {
      // Seguintes: contam desde o último lembrete (ou do fim do adiamento, se for depois)
      const last = [c.lastReminderAt, c.snoozedUntil].filter((d): d is Date => Boolean(d) && d! <= now).sort((a, b) => b.getTime() - a.getTime())[0];
      if (last && (now.getTime() - last.getTime()) / 60000 < cfg.repeatEveryMinutes) continue;
    }

    const nth = sent + 1;
    out.push({
      id: c.id,
      nth,
      waitingMinutes: Math.floor(waitingMinutes),
      escalate: cfg.escalateToManagersAt > 0 && nth >= cfg.escalateToManagersAt,
    });
  }
  return out;
}

export function formatWait(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h}h${String(minutes % 60).padStart(2, '0')}`;
  return `${Math.floor(h / 24)}d`;
}
