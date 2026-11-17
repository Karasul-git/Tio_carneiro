/**
 * Cálculos dos relatórios. Funções puras, testáveis sem banco.
 */

export type MsgLite = { timestamp: Date; fromMe: boolean; sender: string };

export type Episode = {
  /** Primeira mensagem do cliente sem resposta */
  start: Date;
  /** Primeira resposta de uma pessoa (celular ou painel); null = ainda sem resposta */
  end: Date | null;
  minutes: number | null;
};

/**
 * Divide a conversa em "esperas": começa na primeira mensagem do cliente sem
 * resposta e termina na primeira resposta de uma pessoa. Mensagens do robô
 * não contam como resposta (o tempo é o do atendimento humano).
 */
export function responseEpisodes(messages: MsgLite[]): Episode[] {
  const out: Episode[] = [];
  let start: Date | null = null;
  for (const m of [...messages].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())) {
    if (!m.fromMe) {
      start ??= m.timestamp;
    } else if (m.sender !== 'BOT' && start) {
      out.push({ start, end: m.timestamp, minutes: (m.timestamp.getTime() - start.getTime()) / 60000 });
      start = null;
    }
  }
  if (start) out.push({ start, end: null, minutes: null });
  return out;
}

export type DurationStats = {
  count: number;
  medianMinutes: number | null;
  averageMinutes: number | null;
  p90Minutes: number | null;
  /** % respondidas em até `withinMinutes` */
  withinPct: number | null;
};

export function durationStats(minutes: number[], withinMinutes = 15): DurationStats {
  const v = minutes.filter((m) => Number.isFinite(m) && m >= 0).sort((a, b) => a - b);
  if (!v.length) return { count: 0, medianMinutes: null, averageMinutes: null, p90Minutes: null, withinPct: null };
  const q = (p: number) => {
    const idx = (v.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return v[lo] + (v[hi] - v[lo]) * (idx - lo);
  };
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    count: v.length,
    medianMinutes: round(q(0.5)),
    averageMinutes: round(v.reduce((s, x) => s + x, 0) / v.length),
    p90Minutes: round(q(0.9)),
    withinPct: Math.round((v.filter((x) => x <= withinMinutes).length / v.length) * 100),
  };
}

/** Data local (AAAA-MM-DD) no fuso informado. */
export function dayKey(d: Date, timeZone = 'America/Sao_Paulo') {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Todos os dias entre duas datas (inclusive), no fuso informado. */
export function daysBetween(from: Date, to: Date, timeZone = 'America/Sao_Paulo') {
  const out: string[] = [];
  const seen = new Set<string>();
  for (let t = from.getTime(); t <= to.getTime() + 3600_000; t += 3600_000 * 6) {
    const k = dayKey(new Date(t), timeZone);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  const last = dayKey(to, timeZone);
  return out.filter((k) => k <= last);
}
