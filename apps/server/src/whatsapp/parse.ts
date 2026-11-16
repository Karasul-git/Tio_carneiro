import {
  extractMessageContent,
  getContentType,
  isJidBroadcast,
  isJidGroup,
  isJidStatusBroadcast,
  isLidUser,
  isPnUser,
  jidNormalizedUser,
  type WAMessage,
} from 'baileys';

export type ParsedMessage = {
  waMessageId: string;
  /** JID usado para responder ao contato */
  jid: string;
  /** Telefone do contato (somente dígitos), quando conhecido */
  phone: string | null;
  fromMe: boolean;
  pushName: string | null;
  type: string;
  body: string | null;
  timestamp: Date;
};

const TYPE_LABELS: Record<string, string> = {
  image: '📷 Imagem',
  video: '🎥 Vídeo',
  audio: '🎤 Áudio',
  document: '📄 Documento',
  sticker: 'Figurinha',
  location: '📍 Localização',
  contact: '👤 Contato',
};

/** Retorna true para conversas que o sistema não atende (grupos, status, listas de transmissão, newsletters). */
export function isIgnoredJid(jid: string | null | undefined): boolean {
  if (!jid) return true;
  if (isJidGroup(jid) || isJidStatusBroadcast(jid) || isJidBroadcast(jid)) return true;
  if (jid.endsWith('@newsletter')) return true;
  return !(isPnUser(jid) || isLidUser(jid));
}

export function phoneFromJid(jid: string | null | undefined): string | null {
  if (!jid || !isPnUser(jid)) return null;
  const user = jidNormalizedUser(jid).split('@')[0];
  return /^\d+$/.test(user) ? user : null;
}

function toDate(ts: WAMessage['messageTimestamp']): Date {
  if (ts == null) return new Date();
  const seconds = typeof ts === 'number' ? ts : Number(ts.toString());
  return new Date(seconds * 1000);
}

/** Converte uma mensagem do Baileys no formato interno. Retorna null para mensagens ignoradas. */
export function parseMessage(msg: WAMessage): ParsedMessage | null {
  const key = msg.key;
  const remoteJid = key?.remoteJid;
  if (!key?.id || isIgnoredJid(remoteJid)) return null;

  const content = extractMessageContent(msg.message);
  if (!content) return null; // mensagens de protocolo, reações apagadas etc.

  const contentType = getContentType(content);
  if (!contentType) return null;
  // Mensagens de sistema que não representam conteúdo da conversa
  if (
    contentType === 'protocolMessage' ||
    contentType === 'senderKeyDistributionMessage' ||
    contentType === 'reactionMessage' ||
    contentType === 'pollUpdateMessage'
  ) {
    return null;
  }

  let type = 'other';
  let body: string | null = null;

  switch (contentType) {
    case 'conversation':
      type = 'text';
      body = content.conversation ?? null;
      break;
    case 'extendedTextMessage':
      type = 'text';
      body = content.extendedTextMessage?.text ?? null;
      break;
    case 'imageMessage':
      type = 'image';
      body = content.imageMessage?.caption || null;
      break;
    case 'videoMessage':
      type = 'video';
      body = content.videoMessage?.caption || null;
      break;
    case 'audioMessage':
      type = 'audio';
      break;
    case 'documentMessage':
      type = 'document';
      body = content.documentMessage?.caption || content.documentMessage?.fileName || null;
      break;
    case 'stickerMessage':
      type = 'sticker';
      break;
    case 'locationMessage':
    case 'liveLocationMessage':
      type = 'location';
      break;
    case 'contactMessage':
    case 'contactsArrayMessage':
      type = 'contact';
      body = content.contactMessage?.displayName ?? null;
      break;
    case 'buttonsResponseMessage':
      type = 'text';
      body = content.buttonsResponseMessage?.selectedDisplayText ?? null;
      break;
    case 'listResponseMessage':
      type = 'text';
      body = content.listResponseMessage?.title ?? null;
      break;
    case 'templateButtonReplyMessage':
      type = 'text';
      body = content.templateButtonReplyMessage?.selectedDisplayText ?? null;
      break;
    default:
      type = 'other';
  }

  const jid = jidNormalizedUser(remoteJid!);
  const phone = phoneFromJid(jid) ?? phoneFromJid(key.remoteJidAlt);

  return {
    waMessageId: key.id,
    jid,
    phone,
    fromMe: Boolean(key.fromMe),
    pushName: key.fromMe ? null : msg.pushName ?? null,
    type,
    body,
    timestamp: toDate(msg.messageTimestamp),
  };
}

/** Texto curto para prévia na lista de conversas e notificações. */
export function previewText(type: string, body: string | null): string {
  if (body && body.trim()) {
    const label = TYPE_LABELS[type];
    return label && type !== 'document' ? `${label}: ${body}` : body;
  }
  return TYPE_LABELS[type] ?? 'Mensagem';
}
