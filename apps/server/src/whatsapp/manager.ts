import fs from 'node:fs/promises';
import path from 'node:path';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  generateMessageIDV2,
  isJidBroadcast,
  isJidGroup,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WASocket,
} from 'baileys';
import QRCode from 'qrcode';
import type { ConnectionStatus, MessageSender } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { emitToConnection } from '../realtime.js';
import { ingestMessages, registerOutgoing } from './ingest.js';
import { botRunner } from '../bot/runner.js';

/** Mensagens recebidas há mais tempo que isso (ex.: servidor estava desligado) não acionam o robô. */
const BOT_MAX_MESSAGE_AGE_MS = 10 * 60_000;

export type SendOptions = {
  sender: Extract<MessageSender, 'PANEL' | 'BOT'>;
  userId?: string;
  meta?: Record<string, unknown>;
  /** Mostra "digitando…" antes de enviar (usado pelo robô) */
  typing?: boolean;
};

/** Quantos QR Codes mostrar antes de desistir (cada um vale ~20–60s). */
const MAX_QR_ATTEMPTS = 6;
const MAX_BACKOFF_MS = 60_000;

const waLogger = logger.child({ module: 'baileys' }, { level: 'warn' });

class Session {
  sock: WASocket | null = null;
  qr: string | null = null;
  status: ConnectionStatus = 'DISCONNECTED';
  private qrAttempts = 0;
  private retries = 0;
  private stopped = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(readonly connectionId: string) {}

  get dir() {
    return path.resolve(config.SESSIONS_DIR, this.connectionId);
  }

  async start() {
    this.stopped = false;
    this.qrAttempts = 0;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    // Evita duas conexões simultâneas para o mesmo número
    try {
      this.sock?.end(undefined);
    } catch {
      /* já fechado */
    }
    this.sock = null;
    await this.setStatus('CONNECTING', { lastError: null });
    await this.connect();
  }

  private async connect() {
    if (this.stopped) return;
    await this.setStatus('CONNECTING');

    const { state, saveCreds } = await useMultiFileAuthState(this.dir);
    let version: [number, number, number] | undefined;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch {
      version = undefined; // usa a versão padrão do Baileys
    }

    const sock = makeWASocket({
      ...(version ? { version } : {}),
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, waLogger) },
      logger: waLogger,
      browser: Browsers.ubuntu('Chrome'),
      // Não marcar como online: assim o celular do atendente continua recebendo notificações.
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldIgnoreJid: (jid) =>
        Boolean(isJidGroup(jid) || isJidBroadcast(jid) || jid.endsWith('@newsletter')),
      getMessage: async () => undefined,
    });
    this.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      // Ignora eventos de um socket antigo, já substituído ou encerrado
      if (this.sock !== sock) return;
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qrAttempts += 1;
        if (this.qrAttempts > MAX_QR_ATTEMPTS) {
          await this.stop('QR Code não foi lido a tempo. Clique em conectar novamente.');
          return;
        }
        this.qr = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
        await this.setStatus('QR');
        await emitToConnection(this.connectionId, 'connection:qr', {
          id: this.connectionId,
          qr: this.qr,
        });
      }

      if (connection === 'open') {
        this.qr = null;
        this.retries = 0;
        this.qrAttempts = 0;
        const phone = sock.user?.id ? jidNormalizedUser(sock.user.id).split('@')[0] : null;
        await this.setStatus('CONNECTED', { phone, connectedAt: new Date(), lastError: null });
        logger.info({ connectionId: this.connectionId, phone }, 'WhatsApp conectado');
      }

      if (connection === 'close') {
        this.sock = null;
        const code = (lastDisconnect?.error as any)?.output?.statusCode as number | undefined;
        if (this.stopped) return;

        if (code === DisconnectReason.loggedOut) {
          logger.warn({ connectionId: this.connectionId }, 'sessão encerrada no celular');
          await fs.rm(this.dir, { recursive: true, force: true });
          this.qr = null;
          await this.setStatus('LOGGED_OUT', {
            lastError: 'Sessão encerrada no celular. Conecte novamente pelo QR Code.',
          });
          return;
        }

        if (code === DisconnectReason.connectionReplaced) {
          this.stopped = true;
          await this.setStatus('DISCONNECTED', {
            lastError: 'Conexão substituída por outra sessão do sistema.',
          });
          return;
        }

        const delay =
          code === DisconnectReason.restartRequired
            ? 0
            : Math.min(1000 * 2 ** this.retries, MAX_BACKOFF_MS);
        this.retries += 1;
        logger.info({ connectionId: this.connectionId, code, delay }, 'reconectando WhatsApp');
        this.reconnectTimer = setTimeout(() => {
          this.connect().catch((err) => logger.error({ err }, 'falha ao reconectar'));
        }, delay);
      }
    });

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      ingestMessages(this.connectionId, messages, { live: true })
        .then((saved) => {
          if (type !== 'notify') return;
          const recent = new Set(
            messages
              .filter((m) => Date.now() - Number(m.messageTimestamp ?? 0) * 1000 < BOT_MAX_MESSAGE_AGE_MS)
              .map((m) => m.key.id),
          );
          for (const m of saved) {
            if (m.sender === 'CUSTOMER') {
              botRunner.onCustomerMessage(m.conversationId, { allowBot: recent.has(m.waMessageId) });
            } else if (m.fromMe && m.sender !== 'BOT') {
              botRunner.cancel(m.conversationId);
            }
          }
        })
        .catch((err) => logger.error({ err }, 'falha ao processar mensagens'));
    });

    sock.ev.on('messaging-history.set', ({ messages }) => {
      ingestMessages(this.connectionId, messages, { live: false, history: true }).catch((err) =>
        logger.error({ err }, 'falha ao processar histórico'),
      );
    });
  }

  async stop(reason?: string) {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const sock = this.sock;
    this.sock = null;
    this.qr = null;
    try {
      sock?.end(undefined);
    } catch {
      /* já fechado */
    }
    await this.setStatus('DISCONNECTED', { lastError: reason ?? null });
  }

  /** Desconecta o aparelho no WhatsApp e apaga a sessão local. */
  async logout() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try {
      await this.sock?.logout();
    } catch {
      /* pode já estar desconectado */
    }
    this.sock = null;
    this.qr = null;
    await fs.rm(this.dir, { recursive: true, force: true });
    await this.setStatus('LOGGED_OUT', { lastError: null, phone: null });
  }

  private async setStatus(
    status: ConnectionStatus,
    extra: { phone?: string | null; connectedAt?: Date; lastError?: string | null } = {},
  ) {
    this.status = status;
    const updated = await prisma.whatsAppConnection
      .update({ where: { id: this.connectionId }, data: { status, ...extra } })
      .catch(() => null); // conexão pode ter sido removida
    if (updated) await emitToConnection(this.connectionId, 'connection:update', updated);
  }
}

export class WhatsAppManager {
  private sessions = new Map<string, Session>();

  private get(id: string) {
    let s = this.sessions.get(id);
    if (!s) {
      s = new Session(id);
      this.sessions.set(id, s);
    }
    return s;
  }

  /** Reabre as sessões que já estavam pareadas quando o servidor foi desligado. */
  async init() {
    await fs.mkdir(config.SESSIONS_DIR, { recursive: true });
    const connections = await prisma.whatsAppConnection.findMany();
    for (const c of connections) {
      const hasCreds = await fs
        .access(path.resolve(config.SESSIONS_DIR, c.id, 'creds.json'))
        .then(() => true)
        .catch(() => false);
      if (hasCreds && c.status !== 'DISCONNECTED' && c.status !== 'LOGGED_OUT') {
        this.get(c.id).start().catch((err) => logger.error({ err }, 'falha ao iniciar sessão'));
      } else if (c.status !== 'DISCONNECTED' && c.status !== 'LOGGED_OUT') {
        await prisma.whatsAppConnection.update({
          where: { id: c.id },
          data: { status: 'DISCONNECTED' },
        });
      }
    }
  }

  start(id: string) {
    return this.get(id).start();
  }

  stop(id: string) {
    return this.get(id).stop();
  }

  logout(id: string) {
    return this.get(id).logout();
  }

  async remove(id: string) {
    const s = this.sessions.get(id);
    if (s) {
      await s.logout().catch(() => {});
      this.sessions.delete(id);
    } else {
      await fs.rm(path.resolve(config.SESSIONS_DIR, id), { recursive: true, force: true });
    }
  }

  getQr(id: string) {
    return this.sessions.get(id)?.qr ?? null;
  }

  isConnected(id: string) {
    return this.sessions.get(id)?.status === 'CONNECTED';
  }

  /** Envia um texto e registra no histórico com o remetente correto. */
  async sendText(connectionId: string, jid: string, text: string, opts: SendOptions) {
    const s = this.sessions.get(connectionId);
    const sock = s?.sock;
    if (!sock || s.status !== 'CONNECTED') {
      throw new Error('WhatsApp desconectado');
    }
    if (opts.typing) {
      await sock.sendPresenceUpdate('composing', jid).catch(() => {});
      // Pausa proporcional ao tamanho do texto, como uma pessoa digitando (1,2s a 4s)
      await new Promise((r) => setTimeout(r, Math.min(1200 + text.length * 20, 4000)));
      await sock.sendPresenceUpdate('paused', jid).catch(() => {});
    }
    const messageId = generateMessageIDV2(sock.user?.id);
    registerOutgoing(messageId, { sender: opts.sender, sentByUserId: opts.userId, meta: opts.meta });
    const sent = await sock.sendMessage(jid, { text }, { messageId });
    if (!sent) throw new Error('Falha ao enviar mensagem');
    // Garante o registro mesmo se o WhatsApp não devolver o eco
    await ingestMessages(connectionId, [sent], { live: true });
    return sent.key.id;
  }

  async shutdown() {
    for (const s of this.sessions.values()) {
      try {
        s.sock?.end(undefined);
      } catch {
        /* ignore */
      }
    }
  }
}

export const whatsapp = new WhatsAppManager();
