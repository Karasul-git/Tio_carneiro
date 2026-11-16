import { z } from 'zod';
import { prisma } from '../db.js';

/**
 * Configurações do robô de triagem, editáveis pela gestão no app.
 * Ficam na tabela Setting (chave "bot").
 */
export const menuOptionSchema = z.object({
  /** Número digitado pelo cliente */
  key: z.string().min(1).max(3),
  label: z.string().min(1),
  /** Assunto registrado na conversa */
  intent: z.string().min(1),
  /**
   * faq = responde dúvidas pela base;
   * collect = pede detalhes e depois passa ao atendente;
   * handoff = passa direto ao atendente
   */
  action: z.enum(['faq', 'collect', 'handoff']),
  /** Mensagem enviada ao escolher a opção */
  prompt: z.string().default(''),
  /** Palavras que também selecionam esta opção (ex.: "orçamento") */
  keywords: z.array(z.string()).default([]),
});

const DEFAULT_HOURS = {
  timezone: 'America/Sao_Paulo',
  days: {
    '0': [],
    '1': ['08:00-18:00'],
    '2': ['08:00-18:00'],
    '3': ['08:00-18:00'],
    '4': ['08:00-18:00'],
    '5': ['08:00-18:00'],
    '6': ['08:00-12:00'],
  } as Record<string, string[]>,
};

export const botSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  businessHours: z
    .object({
      timezone: z.string(),
      days: z.record(z.string(), z.array(z.string())),
    })
    .default(DEFAULT_HOURS),
  messages: z
    .object({
      welcome: z.string().default('Olá{nome}! 👋 Obrigado por falar com a gente.'),
      menuIntro: z.string().default('Como podemos ajudar? Responda com o *número* da opção:'),
      outOfHours: z
        .string()
        .default(
          'Estamos fora do horário de atendimento agora, mas já deixamos sua mensagem registrada. Responderemos assim que voltarmos. 🙏',
        ),
      handoff: z.string().default('Perfeito! Já passei seu atendimento para nossa equipe. Em instantes alguém continua com você. 😊'),
      handoffOutOfHours: z
        .string()
        .default('Perfeito! Já deixei tudo anotado para nossa equipe, que vai te responder assim que voltarmos ao horário de atendimento. 😊'),
      faqFollowUp: z
        .string()
        .default('Posso ajudar em mais alguma coisa? Se preferir falar com uma pessoa, é só digitar *atendente*.'),
      notUnderstood: z.string().default('Desculpe, não entendi. Responda com o *número* de uma das opções:'),
    })
    .prefault({}),
  menu: z.array(menuOptionSchema).default([
    {
      key: '1',
      label: 'Fazer orçamento ou pedido',
      intent: 'orcamento',
      action: 'collect',
      prompt:
        'Ótimo! Conte pra gente o que você precisa: *produto*, *quantidade*, *tamanhos/cores* e se tem *prazo*. Pode mandar tudo numa mensagem só.',
      keywords: ['orcamento', 'orçamento', 'pedido', 'comprar', 'encomenda', 'cotação', 'preço', 'valor'],
    },
    {
      key: '2',
      label: 'Tirar dúvidas (prazos, pagamento, entrega…)',
      intent: 'duvida',
      action: 'faq',
      prompt: 'Claro! Qual é a sua dúvida?',
      keywords: ['duvida', 'dúvida', 'pergunta', 'informação'],
    },
    {
      key: '3',
      label: 'Acompanhar um pedido',
      intent: 'acompanhamento',
      action: 'collect',
      prompt: 'Me informe o *nome* ou *número do pedido* que vamos verificar.',
      keywords: ['acompanhar', 'status', 'rastreio', 'chegou', 'entrega do pedido', 'meu pedido'],
    },
    {
      key: '4',
      label: 'Falar com um atendente',
      intent: 'atendente',
      action: 'handoff',
      prompt: '',
      keywords: ['atendente', 'humano', 'pessoa', 'falar com alguem'],
    },
  ]),
  /** Confiança mínima para o robô responder sozinho */
  autoAnswerThreshold: z.number().min(0).max(1).default(0.72),
  /** Abaixo disso a sugestão nem é mostrada ao atendente */
  suggestThreshold: z.number().min(0).max(1).default(0.45),
  /** Horas sem mensagens para começar um novo atendimento (robô cumprimenta de novo) */
  sessionGapHours: z.number().min(0.5).max(168).default(8),
  /** Limite de mensagens do robô por atendimento (proteção contra bloqueio) */
  maxBotMessagesPerSession: z.number().int().min(1).max(30).default(8),
  /** Segundos esperando o cliente terminar de digitar antes de responder */
  debounceSeconds: z.number().min(0).max(30).default(4),
  /** Responder dúvidas pela base logo na primeira mensagem, se a confiança for alta */
  answerFirstMessage: z.boolean().default(true),
  /** Usar IA (Claude) para escrever o resumo, se houver chave configurada */
  useAiSummary: z.boolean().default(true),
});

export type BotSettings = z.infer<typeof botSettingsSchema>;
export type MenuOption = z.infer<typeof menuOptionSchema>;

export const defaultBotSettings = (): BotSettings => botSettingsSchema.parse({});

let cache: BotSettings | null = null;

export async function getBotSettings(): Promise<BotSettings> {
  if (cache) return cache;
  const row = await prisma.setting.findUnique({ where: { key: 'bot' } });
  const base = defaultBotSettings();
  cache = row ? botSettingsSchema.parse({ ...base, ...(row.value as object) }) : base;
  return cache;
}

export async function saveBotSettings(input: unknown): Promise<BotSettings> {
  const current = await getBotSettings();
  const merged = botSettingsSchema.parse({ ...current, ...(input as object) });
  await prisma.setting.upsert({
    where: { key: 'bot' },
    create: { key: 'bot', value: merged },
    update: { value: merged },
  });
  cache = merged;
  return merged;
}
