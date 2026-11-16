export function formatPhone(phone: string | null | undefined) {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '');
  // Com DDI 55 (vindo do WhatsApp) ou só DDD + número (digitado pelo cliente)
  const m = d.match(/^(?:55)?(\d{2})(\d{4,5})(\d{4})$/);
  if (m && (d.length === 10 || d.length === 11 || d.startsWith('55'))) return `(${m[1]}) ${m[2]}-${m[3]}`;
  return `+${d}`;
}

export const formatCep = (cep: string | null | undefined) => {
  const d = (cep ?? '').replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : (cep ?? '');
};

export function contactName(c: { name: string | null; phone: string | null }) {
  return c.name || formatPhone(c.phone) || 'Contato';
}

export function waitingLabel(since: string | null, now = Date.now()) {
  if (!since) return '';
  const min = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h${String(min % 60).padStart(2, '0')}`;
  return `${Math.floor(h / 24)}d`;
}

/** Nível visual de urgência pelo tempo de espera */
export function waitingLevel(since: string | null, now = Date.now()): 'ok' | 'warn' | 'late' {
  if (!since) return 'ok';
  const min = (now - new Date(since).getTime()) / 60000;
  if (min >= 30) return 'late';
  if (min >= 10) return 'warn';
  return 'ok';
}

export function timeLabel(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export const roleLabel = { ADMIN: 'Administrador', GESTOR: 'Gestor', ATENDENTE: 'Atendente' } as const;

export const statusLabel = {
  DISCONNECTED: 'Desconectado',
  CONNECTING: 'Conectando…',
  QR: 'Aguardando QR Code',
  CONNECTED: 'Conectado',
  LOGGED_OUT: 'Sessão encerrada',
} as const;

export const intentLabels: Record<string, string> = {
  orcamento: 'Orçamento',
  pedido: 'Pedido',
  duvida: 'Dúvida',
  acompanhamento: 'Acompanhamento',
  atendente: 'Quer atendente',
  troca: 'Troca',
  pagamento: 'Pagamento',
};

export const botStateLabel = {
  NONE: '',
  MENU: '🤖 No menu',
  COLLECTING: '🤖 Coletando detalhes',
  FAQ: '🤖 Tirando dúvidas',
  HANDOFF: '🔔 Aguardando atendente',
  HUMAN: '👤 Com atendente',
} as const;

export const isBotActive = (s: string) => s === 'MENU' || s === 'COLLECTING' || s === 'FAQ';

export const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** "35", "35,9", "1.234,50", "R$ 10" → centavos; vazio → null */
export function parseBRL(text: string): number | null {
  const t = text.replace(/[^\d,.-]/g, '').trim();
  if (!t) return null;
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export const centsToInput = (cents: number | null | undefined) =>
  cents == null ? '' : (cents / 100).toFixed(2).replace('.', ',');

export const orderStatusLabel: Record<string, string> = {
  DRAFT: 'Rascunho',
  SUBMITTED: 'Enviado pelo cliente',
  CONFIRMED: 'Confirmado',
  IN_PRODUCTION: 'Em produção',
  READY: 'Pronto',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
};

export function formatDocument(doc: string | null | undefined) {
  const d = (doc ?? '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return doc ?? '';
}

export const dateLabel = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '';

/** Para <input type="date"> */
export const dateInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');
