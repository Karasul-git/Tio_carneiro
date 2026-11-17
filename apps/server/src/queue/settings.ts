import { z } from 'zod';
import { prisma } from '../db.js';

/** Configuração da fila de atendimento e dos lembretes (tabela Setting, chave "queue"). */
export const queueSettingsSchema = z.object({
  reminders: z
    .object({
      enabled: z.boolean().default(true),
      /** Minutos sem resposta até o primeiro lembrete */
      firstAfterMinutes: z.number().int().min(1).max(1440).default(15),
      /** Intervalo entre lembretes seguintes */
      repeatEveryMinutes: z.number().int().min(5).max(1440).default(30),
      /** Máximo de lembretes por espera */
      maxReminders: z.number().int().min(1).max(20).default(3),
      /** A partir deste lembrete, avisa também gestores (0 = nunca) */
      escalateToManagersAt: z.number().int().min(0).max(20).default(2),
      /** Só lembrar dentro do horário de atendimento (o do robô) */
      onlyBusinessHours: z.boolean().default(true),
      /** Conversa parada na triagem do robô por mais que isso também entra nos lembretes */
      triageStuckMinutes: z.number().int().min(5).max(1440).default(30),
    })
    .prefault({}),
  orderReminders: z
    .object({
      enabled: z.boolean().default(true),
      /** Pedido enviado pelo cliente e não confirmado após X horas */
      submittedHours: z.number().min(0.5).max(168).default(4),
      /** Avisar quando faltar até X dias para o prazo combinado */
      dueSoonDays: z.number().int().min(0).max(30).default(2),
    })
    .prefault({}),
  priority: z
    .object({
      /** Peso do tempo de espera */
      waitingWeight: z.number().min(0).max(10).default(1),
      /** Minutos em que o tempo de espera atinge a pontuação máxima */
      waitingCapMinutes: z.number().int().min(10).max(10080).default(480),
      unhappyWeight: z.number().min(0).max(10).default(0),
      urgentWeight: z.number().min(0).max(10).default(0),
      recurringWeight: z.number().min(0).max(10).default(0),
      /** Cliente recorrente: pelo menos N pedidos */
      recurringMinOrders: z.number().int().min(1).max(100).default(2),
      bigCustomerWeight: z.number().min(0).max(10).default(0),
      /** Cliente forte: total comprado (em centavos) nos últimos 12 meses */
      bigCustomerMinCents: z.number().int().min(0).default(500000),
    })
    .prefault({}),
});

export type QueueSettings = z.infer<typeof queueSettingsSchema>;

let cache: QueueSettings | null = null;

export async function getQueueSettings(): Promise<QueueSettings> {
  if (cache) return cache;
  const row = await prisma.setting.findUnique({ where: { key: 'queue' } });
  cache = queueSettingsSchema.parse(row?.value ?? {});
  return cache;
}

export async function saveQueueSettings(input: unknown): Promise<QueueSettings> {
  const current = await getQueueSettings();
  const body = (input ?? {}) as Partial<QueueSettings>;
  const merged = queueSettingsSchema.parse({
    reminders: { ...current.reminders, ...(body.reminders ?? {}) },
    orderReminders: { ...current.orderReminders, ...(body.orderReminders ?? {}) },
    priority: { ...current.priority, ...(body.priority ?? {}) },
  });
  await prisma.setting.upsert({ where: { key: 'queue' }, create: { key: 'queue', value: merged }, update: { value: merged } });
  cache = merged;
  return merged;
}
