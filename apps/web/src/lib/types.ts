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
  botEnabled: boolean;
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
  botState: BotState;
  intent: string | null;
  summary: string | null;
  summaryUpdatedAt: string | null;
  handoffAt: string | null;
  handoffReason: string | null;
  triage: Triage | null;
};

export type BotState = 'NONE' | 'MENU' | 'COLLECTING' | 'FAQ' | 'HANDOFF' | 'HUMAN';

export type Triage = {
  option?: string;
  collected?: string[];
  faq?: { id: string; question: string; confidence: number }[];
  suggestion?: { id: string; question: string; answer: string; confidence: number } | null;
  outOfHours?: boolean;
};

export type KnowledgeItem = {
  id: string;
  question: string;
  variants: string[];
  answer: string;
  category: string | null;
  active: boolean;
  hits: number;
};

export type MenuOption = {
  key: string;
  label: string;
  intent: string;
  action: 'faq' | 'collect' | 'handoff' | 'order';
  prompt: string;
  keywords: string[];
};

export type BotSettings = {
  enabled: boolean;
  businessHours: { timezone: string; days: Record<string, string[]> };
  messages: {
    welcome: string;
    menuIntro: string;
    outOfHours: string;
    handoff: string;
    handoffOutOfHours: string;
    faqFollowUp: string;
    notUnderstood: string;
  };
  menu: MenuOption[];
  autoAnswerThreshold: number;
  suggestThreshold: number;
  sessionGapHours: number;
  maxBotMessagesPerSession: number;
  debounceSeconds: number;
  answerFirstMessage: boolean;
  useAiSummary: boolean;
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

export type Product = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  sku: string | null;
  priceCents: number | null;
  sizes: string[];
  colors: string[];
  sizeSurchargeCents: Record<string, number> | null;
  minQuantity: number;
  customizable: boolean;
  imageUrl: string | null;
  active: boolean;
  position: number;
  ncm: string | null;
  cfop: string | null;
  origin: number | null;
  unit: string;
};

export type Customer = {
  id: string;
  name: string;
  personType: 'PF' | 'PJ';
  document: string | null;
  stateRegistration: string | null;
  email: string | null;
  phone: string | null;
  zipCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  cityCode: string | null;
  notes: string | null;
  _count?: { orders: number };
};

export type OrderStatus = 'DRAFT' | 'SUBMITTED' | 'CONFIRMED' | 'IN_PRODUCTION' | 'READY' | 'DELIVERED' | 'CANCELLED';

export type OrderItem = {
  id?: string;
  productId: string | null;
  description: string;
  size: string | null;
  color: string | null;
  quantity: number;
  unitPriceCents: number | null;
  customization: string | null;
};

export type Order = {
  id: string;
  number: number;
  token: string;
  status: OrderStatus;
  customer: Customer | null;
  customerId: string | null;
  connection: { id: string; name: string } | null;
  conversation: { id: string; contact: { id: string; name: string | null; phone: string | null } } | null;
  createdBy: { id: string; name: string } | null;
  deliveryMethod: 'PICKUP' | 'DELIVERY';
  desiredDate: string | null;
  dueDate: string | null;
  customerNotes: string | null;
  internalNotes: string | null;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  submittedAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  link?: string;
};

export type Company = {
  name: string;
  document: string;
  showPrices: boolean;
  publicUrl: string;
  orderLinkMessage: string;
  orderReceivedMessage: string;
  orderPageIntro: string;
};
