import { describe, expect, it } from 'vitest';
import { dueReminders, type ReminderCandidate } from '../src/queue/reminders.js';
import { defaultPriority, priority, sortByPriority } from '../src/lib/priority.js';
import { queueSettingsSchema } from '../src/queue/settings.js';

const now = new Date('2026-01-01T12:00:00Z');
const ago = (m: number) => new Date(now.getTime() - m * 60000);
const cfg = queueSettingsSchema.parse({}).reminders; // 15 min, a cada 30, máx. 3, escala no 2º

const conv = (over: Partial<ReminderCandidate> = {}): ReminderCandidate => ({
  id: 'c1',
  awaitingSince: ago(20),
  inBotTriage: false,
  lastMessageAt: ago(20),
  reminderFor: null,
  remindersSent: 0,
  lastReminderAt: null,
  snoozedUntil: null,
  ...over,
});

describe('lembretes de atendimento', () => {
  it('primeiro lembrete após o tempo configurado', () => {
    expect(dueReminders([conv({ awaitingSince: ago(10) })], cfg, now)).toEqual([]);
    expect(dueReminders([conv()], cfg, now)).toEqual([{ id: 'c1', nth: 1, waitingMinutes: 20, escalate: false }]);
  });

  it('repete contando a partir do último lembrete e escala para gestores no 2º', () => {
    const since = ago(300); // esperando há 5 horas
    const base = { awaitingSince: since, reminderFor: since, remindersSent: 1 };
    expect(dueReminders([conv({ ...base, lastReminderAt: ago(1) })], cfg, now)).toEqual([]);
    expect(dueReminders([conv({ ...base, lastReminderAt: ago(29) })], cfg, now)).toEqual([]);
    const r = dueReminders([conv({ ...base, lastReminderAt: ago(31) })], cfg, now);
    expect(r[0]).toMatchObject({ nth: 2, escalate: true, waitingMinutes: 300 });
  });

  it('para no máximo de lembretes', () => {
    const since = ago(500);
    expect(dueReminders([conv({ awaitingSince: since, reminderFor: since, remindersSent: 3 })], cfg, now)).toEqual([]);
  });

  it('nova espera zera a contagem', () => {
    const r = dueReminders([conv({ awaitingSince: ago(20), reminderFor: ago(300), remindersSent: 3 })], cfg, now);
    expect(r[0].nth).toBe(1);
  });

  it('respeita o adiamento', () => {
    expect(dueReminders([conv({ snoozedUntil: new Date(now.getTime() + 60000) })], cfg, now)).toEqual([]);
    // adiamento acabou há 5 min: ainda não passou o tempo do primeiro lembrete
    expect(dueReminders([conv({ awaitingSince: ago(120), snoozedUntil: ago(5) })], cfg, now)).toEqual([]);
    expect(dueReminders([conv({ awaitingSince: ago(120), snoozedUntil: ago(16) })], cfg, now)).toHaveLength(1);
  });

  it('triagem do robô só entra se estiver parada', () => {
    expect(dueReminders([conv({ inBotTriage: true, lastMessageAt: ago(5) })], cfg, now)).toEqual([]);
    expect(dueReminders([conv({ awaitingSince: ago(40), inBotTriage: true, lastMessageAt: ago(35) })], cfg, now)).toHaveLength(1);
  });
});

describe('prioridade configurável', () => {
  it('padrão: só o tempo de espera conta', () => {
    const p = priority({ awaitingSince: ago(30), unhappy: true, customerOrders: 10 }, now);
    expect(p.reasons).toEqual([]);
  });

  it('com pesos, cliente insatisfeito e recorrente passa na frente de quem espera mais', () => {
    const cfgP = { ...defaultPriority, unhappyWeight: 1, recurringWeight: 0.5, recurringMinOrders: 3 };
    const items = [
      { id: 'antigo', awaitingSince: ago(120), lastMessageAt: ago(120) },
      { id: 'irritado', awaitingSince: ago(10), lastMessageAt: ago(10), unhappy: true },
      { id: 'fiel', awaitingSince: ago(20), lastMessageAt: ago(20), customerOrders: 5 },
    ];
    expect(sortByPriority(items, now, cfgP).map((i) => i.id)).toEqual(['irritado', 'fiel', 'antigo']);
    expect(priority(items[1], now, cfgP).reasons).toEqual(['unhappy']);
    expect(priority(items[2], now, cfgP).reasons).toEqual(['recurring']);
  });

  it('cliente que compra muito', () => {
    const cfgP = { ...defaultPriority, bigCustomerWeight: 1, bigCustomerMinCents: 100000 };
    expect(priority({ awaitingSince: ago(1), customerSpentCents: 150000 }, now, cfgP).reasons).toEqual(['bigCustomer']);
    expect(priority({ awaitingSince: ago(1), customerSpentCents: 50000 }, now, cfgP).reasons).toEqual([]);
  });
});
