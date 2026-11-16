import { normalizeText } from './normalize.js';

/** Extração simples de informações úteis das mensagens do cliente. */
export type Details = {
  items: string[];
  sizes: string[];
  colors: string[];
  deadline: string[];
  urgent: boolean;
  unhappy: boolean;
  hasDocument: boolean;
};

const PRODUCTS = [
  'camiseta', 'camisa', 'polo', 'regata', 'baby look', 'blusa', 'moletom', 'blusao', 'jaqueta', 'colete',
  'calca', 'bermuda', 'short', 'saia', 'vestido', 'macacao', 'conjunto', 'uniforme', 'avental', 'jaleco',
  'bone', 'ecobag', 'abada', 'pijama', 'legging', 'agasalho', 'camisao', 'body', 'touca', 'mascara',
];
const COLORS = [
  'preto', 'preta', 'branco', 'branca', 'azul', 'marinho', 'royal', 'vermelho', 'vermelha', 'verde', 'amarelo',
  'amarela', 'rosa', 'pink', 'cinza', 'mescla', 'marrom', 'bege', 'roxo', 'roxa', 'lilas', 'laranja', 'vinho',
  'bordo', 'off white', 'nude', 'grafite', 'chumbo',
];
const UNITS = 'unidade|unid|un|peca|pc|kit';
const WEEKDAYS = 'segunda|terca|quarta|quinta|sexta|sabado|domingo';

const unique = <T,>(xs: T[]) => [...new Set(xs)];

/** Singular aproximado de uma palavra já normalizada ("moletons" → "moletom"). */
function singular(w: string) {
  if (w.length <= 3) return w;
  if (w.endsWith('uis')) return w.slice(0, -3) + 'ul';
  if (w.endsWith('oes') || w.endsWith('aes')) return w.slice(0, -3) + 'ao';
  if (w.endsWith('ns')) return w.slice(0, -2) + 'm';
  if (w.endsWith('res') || w.endsWith('zes')) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w !== 'jeans') return w.slice(0, -1);
  return w;
}

function plural(w: string) {
  if (w.endsWith('m')) return w.slice(0, -1) + 'ns';
  if (w.endsWith('ao')) return w.slice(0, -2) + 'oes';
  if (/[rz]$/.test(w)) return w + 'es';
  return w + 's';
}

export function extractDetails(messages: string[]): Details {
  const raw = messages.join('\n');
  const text = normalizeText(raw).split(' ').map(singular).join(' ');

  const items: string[] = [];
  const productRe = PRODUCTS.map((p) => p.replace(' ', '\\s')).join('|');
  // "50 camisetas", "50 unidades de camiseta", "100 pçs"
  const qtyRe = new RegExp(`\\b(\\d{1,6})\\s*(?:(${UNITS})\\s*(?:de\\s+)?)?(${productRe})?\\b`, 'g');
  for (const m of text.matchAll(qtyRe)) {
    const [, qty, unit, product] = m;
    if (!unit && !product) continue;
    const name = product ? (Number(qty) > 1 ? plural(product) : product) : unit;
    items.push(`${qty} ${name}`);
  }
  const productsMentioned = PRODUCTS.filter((p) => new RegExp(`\\b${p}\\b`).test(text));
  for (const p of productsMentioned) if (!items.some((i) => i.includes(p))) items.push(p);

  // Tamanhos: siglas em maiúsculas no texto original, ou após a palavra "tamanho"
  const sizes = unique(
    [...raw.matchAll(/\b(PP|P|M|G|GG|XG|XGG|EG|EGG|G[1-4])\b/g)].map((m) => m[1]),
  );
  if (sizes.length === 1 && !/tamanh|tam\b/.test(text)) sizes.length = 0; // um "M" solto é pouco confiável
  for (const m of text.matchAll(/\btam(?:anho)?s?\s*(\d{1,2})\b/g)) sizes.push(m[1]);

  const colors = unique(COLORS.filter((c) => new RegExp(`\\b${c}\\b`).test(text)));

  const deadline = unique(
    [
      ...text.matchAll(new RegExp(`\\bate\\s+(?:o\\s+dia\\s+|dia\\s+|a\\s+|o\\s+)?(\\d{1,2}(?:\\s\\d{1,2})?|${WEEKDAYS}(?:\\sfeira)?|amanha|semana que vem|fim do mes|final do mes)\\b`, 'g')),
      ...text.matchAll(/\bpara\s+(?:o\s+)?dia\s+(\d{1,2}(?:\s\d{1,2})?)\b/g),
    ].map((m) => `até ${m[1].replace(' ', '/')}`),
  );

  const urgent = /\b(urgente|urgencia|pra ontem|para ontem|o quanto antes|rapido|correria)\b/.test(text);
  const unhappy =
    /\b(absurdo|demora|demorando|ninguem responde|reclama|pessimo|horrivel|cancelar|procon|decepcion|vergonha|descaso|enganad|atrasad)/.test(
      text,
    ) || /!!!/.test(raw);
  const hasDocument = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/.test(raw);

  return { items: unique(items), sizes: unique(sizes), colors, deadline, urgent, unhappy, hasDocument };
}

export type SummaryInput = {
  intentLabel: string | null;
  customerMessages: string[];
  faqAnswered: { question: string }[];
  suggestion?: { question: string; confidence: number } | null;
  handoffReason?: string | null;
  outOfHours?: boolean;
};

/** Resumo por regras (sempre disponível, sem custo). */
export function buildRuleSummary(input: SummaryInput): string {
  const d = extractDetails(input.customerMessages);
  const lines: string[] = [];
  lines.push(`📋 ${input.intentLabel ?? 'Atendimento'}${d.urgent ? ' · ⚡ urgente' : ''}`);
  if (d.unhappy) lines.push('⚠️ Cliente parece insatisfeito');
  const specs = [
    d.items.length ? `Itens: ${d.items.join(', ')}` : '',
    d.sizes.length ? `Tam.: ${d.sizes.join(', ')}` : '',
    d.colors.length ? `Cores: ${d.colors.join(', ')}` : '',
    d.deadline.length ? `Prazo: ${d.deadline.join(', ')}` : '',
  ].filter(Boolean);
  if (specs.length) lines.push(specs.join(' · '));
  if (d.hasDocument) lines.push('Enviou CPF/CNPJ');
  if (input.faqAnswered.length) {
    lines.push(`Robô respondeu: ${input.faqAnswered.map((f) => `"${f.question}"`).join(', ')}`);
  }
  if (input.suggestion) {
    lines.push(`Possível resposta na base: "${input.suggestion.question}" (${Math.round(input.suggestion.confidence * 100)}%)`);
  }
  if (input.handoffReason) lines.push(`Motivo: ${input.handoffReason}`);
  if (input.outOfHours) lines.push('Chegou fora do horário');
  const said = input.customerMessages
    .filter((m) => !/^\s*\d{1,2}\s*[.)-]?\s*$/.test(m)) // escolhas do menu ("1", "2.")
    .join(' / ').replace(/\s+/g, ' ').trim();
  if (said) lines.push(`💬 "${said.length > 280 ? `${said.slice(0, 277)}…` : said}"`);
  return lines.join('\n');
}
