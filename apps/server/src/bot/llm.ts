import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger.js';

/**
 * Resumo opcional com IA (Claude). Só é usado quando há credencial configurada
 * (ANTHROPIC_API_KEY) e a opção está ligada nas configurações do robô.
 * Em qualquer falha, o sistema usa o resumo por regras.
 */
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

let client: Anthropic | null = null;

export const aiAvailable = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

function getClient() {
  if (!client) client = new Anthropic({ timeout: 30_000, maxRetries: 1 });
  return client;
}

const SYSTEM = `Você ajuda os atendentes de uma confecção (fábrica de roupas) que atendem clientes pelo WhatsApp.
Receberá a conversa de um cliente com o robô de triagem. Escreva um resumo curto em português do Brasil para o atendente que vai assumir, no formato:

Linha 1: assunto em poucas palavras (ex.: "Orçamento de uniformes").
Depois, de 1 a 4 linhas começando com "• " com o que importa: produtos, quantidades, tamanhos, cores, personalização, prazo, dúvidas pendentes e o que o cliente espera agora.
Se o cliente parecer irritado ou com pressa, inclua uma linha "⚠️ ..." dizendo isso.

Regras: use só informações da conversa, sem inventar. Não cumprimente nem se dirija ao atendente. No máximo 600 caracteres.`;

export type TranscriptLine = { from: 'cliente' | 'robô' | 'atendente'; text: string };

export async function summarizeWithAi(transcript: TranscriptLine[], contactName: string | null): Promise<string | null> {
  if (!aiAvailable() || transcript.length === 0) return null;
  const conversation = transcript
    .slice(-40)
    .map((l) => `${l.from}: ${l.text}`)
    .join('\n');
  try {
    const response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low' },
      // Se o modelo recusar, a API tenta automaticamente um modelo alternativo
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Cliente: ${contactName ?? 'não identificado'}\n\n<conversa>\n${conversation}\n</conversa>`,
        },
      ],
    });
    if (response.stop_reason === 'refusal') return null;
    const text = response.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();
    return text || null;
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) logger.warn('IA: limite de requisições atingido');
    else if (err instanceof Anthropic.AuthenticationError) logger.warn('IA: chave inválida');
    else if (err instanceof Anthropic.APIError) logger.warn({ status: err.status }, 'IA: erro na API');
    else logger.warn({ err }, 'IA: falha ao gerar resumo');
    return null;
  }
}
