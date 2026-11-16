import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { api } from '../lib/api';
import { useNow, useSocketEvent } from '../lib/hooks';
import { contactName, formatPhone, waitingLabel, waitingLevel } from '../lib/format';
import type { Conversation, Message } from '../lib/types';
import SummaryPanel from './SummaryPanel';

const senderLabel: Record<Message['sender'], string> = {
  CUSTOMER: '',
  ATTENDANT_PHONE: 'pelo celular',
  PANEL: 'pelo painel',
  BOT: 'robô',
};

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function ChatView({
  conversationId,
  initial,
  onBack,
}: {
  conversationId: string;
  initial?: Conversation;
  onBack: () => void;
}) {
  const now = useNow();
  const [conv, setConv] = useState<Conversation | undefined>(initial);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    api<Conversation>(`/conversations/${conversationId}`).then(setConv).catch((e) => setError(e.message));
    api<Message[]>(`/conversations/${conversationId}/messages?limit=50`).then((m) => {
      setMessages(m);
      setHasMore(m.length === 50);
    });
    api(`/conversations/${conversationId}/read`, { body: {} }).catch(() => {});
  }, [conversationId]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onMessage = useCallback(
    ({ conversationId: cid, message }: { conversationId: string; message: Message }) => {
      if (cid !== conversationId) return;
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      if (!message.fromMe) api(`/conversations/${conversationId}/read`, { body: {} }).catch(() => {});
    },
    [conversationId],
  );
  useSocketEvent('message:new', onMessage);

  const onConv = useCallback(
    (c: Conversation) => {
      if (c.id === conversationId) setConv(c);
    },
    [conversationId],
  );
  useSocketEvent('conversation:update', onConv);

  const loadOlder = async () => {
    if (!messages[0]) return;
    const el = scroller.current;
    const prevHeight = el?.scrollHeight ?? 0;
    stickToBottom.current = false;
    const older = await api<Message[]>(
      `/conversations/${conversationId}/messages?limit=50&before=${encodeURIComponent(messages[0].timestamp)}`,
    );
    setHasMore(older.length === 50);
    setMessages((prev) => [...older, ...prev]);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevHeight;
    });
  };

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setError('');
    stickToBottom.current = true;
    try {
      await api(`/conversations/${conversationId}/messages`, { body: { text: value } });
      setText('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 900px)').matches) {
      e.preventDefault();
      send();
    }
  };

  const setStatus = async (status: 'OPEN' | 'CLOSED') => {
    const updated = await api<Conversation>(`/conversations/${conversationId}`, { method: 'PATCH', body: { status } });
    setConv(updated);
  };

  let lastDay = '';
  return (
    <div className="chat">
      <header className="chat-header">
        <button className="icon-btn back" onClick={onBack} aria-label="Voltar">
          ‹
        </button>
        <div className="chat-title">
          <strong className="ellipsis">{conv ? contactName(conv.contact) : '…'}</strong>
          <span className="muted small ellipsis">
            {conv && formatPhone(conv.contact.phone)} {conv && `· ${conv.connection.name}`}
          </span>
        </div>
        {conv?.awaitingSince && conv.status === 'OPEN' && conv.botState !== 'MENU' && conv.botState !== 'COLLECTING' && conv.botState !== 'FAQ' && (
          <span className={`wait ${waitingLevel(conv.awaitingSince, now)} small`}>⏱ {waitingLabel(conv.awaitingSince, now)}</span>
        )}
        {conv &&
          (conv.status === 'OPEN' ? (
            <button className="btn small" onClick={() => setStatus('CLOSED')}>
              Encerrar
            </button>
          ) : (
            <button className="btn small" onClick={() => setStatus('OPEN')}>
              Reabrir
            </button>
          ))}
      </header>

      {conv && <SummaryPanel conv={conv} onChange={setConv} onUseSuggestion={(t) => setText(t)} />}

      <div
        className="messages"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {hasMore && (
          <button className="btn small load-more" onClick={loadOlder}>
            Carregar anteriores
          </button>
        )}
        {messages.map((m) => {
          const day = dayLabel(m.timestamp);
          const showDay = day !== lastDay;
          lastDay = day;
          const label = m.sender === 'PANEL' && m.sentByUser ? m.sentByUser.name : senderLabel[m.sender];
          return (
            <div key={m.id}>
              {showDay && <div className="day">{day}</div>}
              <div className={`bubble ${m.fromMe ? 'out' : 'in'}`}>
                {m.type !== 'text' && <span className="media-type">{mediaLabel(m.type)}</span>}
                {m.body && <span className="text">{m.body}</span>}
                <span className="meta">
                  {label && <span>{label} · </span>}
                  {new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <form className="composer" onSubmit={send}>
        {error && <p className="error small">{error}</p>}
        <div className="composer-row">
          <textarea
            rows={1}
            placeholder="Digite uma mensagem"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            aria-label="Mensagem"
          />
          <button className="btn primary" disabled={sending || !text.trim()}>
            Enviar
          </button>
        </div>
      </form>
    </div>
  );
}

function mediaLabel(type: string) {
  return (
    {
      image: '📷 Imagem',
      video: '🎥 Vídeo',
      audio: '🎤 Áudio',
      document: '📄 Documento',
      sticker: 'Figurinha',
      location: '📍 Localização',
      contact: '👤 Contato',
    } as Record<string, string>
  )[type] ?? 'Mensagem não suportada (veja no celular)';
}
