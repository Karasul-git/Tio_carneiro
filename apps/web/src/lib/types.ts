export type Role = 'ADMIN' | 'GESTOR' | 'ATENDENTE';

export type User = { id: string; name: string; email: string; role: Role; active?: boolean };

export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'QR' | 'CONNECTED' | 'LOGGED_OUT';

export type Connection = {
  id: string;
  name: string;
  phone: string | null;
  status: ConnectionStatus;
  attendantId: string | null;
  attendant: { id: string; name: string } | null;
  lastError: string | null;
  connectedAt: string | null;
};

export type Contact = { id: string; jid: string; phone: string | null; name: string | null };

export type Conversation = {
  id: string;
  connectionId: string;
  connection: { id: string; name: string };
  contact: Contact;
  status: 'OPEN' | 'CLOSED';
  awaitingSince: string | null;
  lastMessageAt: string | null;
  lastMessageText: string | null;
  unreadCount: number;
};

export type Message = {
  id: string;
  conversationId: string;
  waMessageId: string;
  fromMe: boolean;
  sender: 'CUSTOMER' | 'ATTENDANT_PHONE' | 'PANEL' | 'BOT';
  sentByUser?: { id: string; name: string } | null;
  type: string;
  body: string | null;
  timestamp: string;
};
