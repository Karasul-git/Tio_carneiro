export function formatPhone(phone: string | null | undefined) {
  if (!phone) return '';
  const m = phone.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : `+${phone}`;
}

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
