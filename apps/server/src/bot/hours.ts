/** Horário de atendimento, considerando o fuso configurado. */
export type BusinessHours = {
  timezone: string;
  /** 0 = domingo ... 6 = sábado. Cada dia: lista de intervalos "HH:MM-HH:MM" (vazio = fechado) */
  days: Record<string, string[]>;
};

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { weekday, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

export function isOpen(hours: BusinessHours, date = new Date()) {
  const { weekday, minutes } = localParts(date, hours.timezone);
  const ranges = hours.days[String(weekday)] ?? [];
  return ranges.some((r) => {
    const [start, end] = r.split('-');
    if (!start || !end) return false;
    return minutes >= toMinutes(start) && minutes < toMinutes(end);
  });
}
