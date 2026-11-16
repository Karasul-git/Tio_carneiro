/**
 * Regras de estado de uma conversa a partir das mensagens recebidas/enviadas.
 * Funções puras para facilitar testes.
 */
export type ConversationState = {
  awaitingSince: Date | null;
  lastMessageAt: Date | null;
  unreadCount: number;
};

export type IncomingEvent = {
  fromMe: boolean;
  timestamp: Date;
};

export function applyMessage(state: ConversationState, msg: IncomingEvent): ConversationState {
  const isNewest = !state.lastMessageAt || msg.timestamp >= state.lastMessageAt;
  const lastMessageAt = isNewest ? msg.timestamp : state.lastMessageAt;

  if (msg.fromMe) {
    // Qualquer resposta nossa (celular, painel ou robô) mais recente que a espera zera a fila.
    const answers = state.awaitingSince && msg.timestamp >= state.awaitingSince;
    return {
      awaitingSince: answers ? null : state.awaitingSince,
      lastMessageAt,
      unreadCount: answers ? 0 : state.unreadCount,
    };
  }

  // Mensagem do cliente: começa a espera se ainda não estiver esperando.
  // Mensagens antigas fora de ordem (ex.: histórico) não reabrem a espera.
  const awaitingSince = state.awaitingSince ?? (isNewest ? msg.timestamp : null);
  return {
    awaitingSince,
    lastMessageAt,
    unreadCount: isNewest ? state.unreadCount + 1 : state.unreadCount,
  };
}
