import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useNow, useSocketEvent } from '../lib/hooks';
import { contactName, timeLabel, waitingLabel, waitingLevel } from '../lib/format';
import type { Connection, Conversation } from '../lib/types';
import ChatView from '../components/ChatView';

type Filter = 'awaiting' | 'open' | 'closed' | 'all';
const filters: { id: Filter; label: string }[] = [
  { id: 'awaiting', label: 'Aguardando' },
  { id: 'open', label: 'Abertas' },
  { id: 'closed', label: 'Encerradas' },
  { id: 'all', label: 'Todas' },
];

function matches(c: Conversation, filter: Filter, connectionId: string) {
  if (connectionId && c.connectionId !== connectionId) return false;
  if (filter === 'awaiting') return c.status === 'OPEN' && Boolean(c.awaitingSince);
  if (filter === 'open') return c.status === 'OPEN';
  if (filter === 'closed') return c.status === 'CLOSED';
  return true;
}

/** Mesma ordem do servidor: quem espera há mais tempo primeiro. */
function sortConversations(list: Conversation[]) {
  return [...list].sort((a, b) => {
    if (Boolean(a.awaitingSince) !== Boolean(b.awaitingSince)) return a.awaitingSince ? -1 : 1;
    if (a.awaitingSince && b.awaitingSince) return a.awaitingSince.localeCompare(b.awaitingSince);
    return (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '');
  });
}

export default function InboxPage() {
  const { id: selectedId } = useParams();
  const navigate = useNavigate();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>('awaiting');
  const [connectionId, setConnectionId] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Conversation[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ filter });
    if (connectionId) qs.set('connectionId', connectionId);
    if (search.trim()) qs.set('search', search.trim());
    try {
      setItems(await api<Conversation[]>(`/conversations?${qs}`));
    } finally {
      setLoading(false);
    }
  }, [filter, connectionId, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  useEffect(() => {
    api<Connection[]>('/connections').then(setConnections).catch(() => {});
  }, []);

  const onUpdate = useCallback(
    (conv: Conversation) => {
      setItems((prev) => {
        const rest = prev.filter((c) => c.id !== conv.id);
        if (!matches(conv, filter, connectionId) || search.trim()) {
          return search.trim() && prev.some((c) => c.id === conv.id) ? sortConversations([...rest, conv]) : rest;
        }
        return sortConversations([...rest, conv]);
      });
    },
    [filter, connectionId, search],
  );
  useSocketEvent('conversation:update', onUpdate);

  const awaitingCount = useMemo(() => items.filter((c) => c.awaitingSince && c.status === 'OPEN').length, [items]);
  const selected = items.find((c) => c.id === selectedId);

  return (
    <div className={`inbox ${selectedId ? 'has-selection' : ''}`}>
      <section className="inbox-list" aria-label="Conversas">
        <header className="inbox-header">
          <div className="row">
            <h1>Conversas</h1>
            {awaitingCount > 0 && <span className="pill warn">{awaitingCount} aguardando</span>}
          </div>
          <input
            className="search"
            type="search"
            placeholder="Buscar por nome ou telefone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="row gap">
            <div className="tabs" role="tablist">
              {filters.map((f) => (
                <button key={f.id} role="tab" aria-selected={filter === f.id} className={`tab ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {connections.length > 1 && (
            <select value={connectionId} onChange={(e) => setConnectionId(e.target.value)} aria-label="Número">
              <option value="">Todos os números</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </header>

        <ul className="conv-list">
          {loading && <li className="empty">Carregando…</li>}
          {!loading && items.length === 0 && (
            <li className="empty">{filter === 'awaiting' ? 'Nenhum cliente aguardando resposta 🎉' : 'Nenhuma conversa encontrada.'}</li>
          )}
          {items.map((c) => {
            const level = waitingLevel(c.awaitingSince, now);
            return (
              <li key={c.id}>
                <Link to={`/conversas/${c.id}`} className={`conv ${c.id === selectedId ? 'selected' : ''}`}>
                  <div className="avatar" aria-hidden="true">
                    {contactName(c.contact).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="conv-body">
                    <div className="conv-top">
                      <strong className="ellipsis">{contactName(c.contact)}</strong>
                      <span className="muted small">{timeLabel(c.lastMessageAt)}</span>
                    </div>
                    <div className="conv-bottom">
                      <span className="ellipsis muted">{c.lastMessageText ?? ''}</span>
                      {c.unreadCount > 0 && <span className="badge">{c.unreadCount}</span>}
                    </div>
                    <div className="conv-meta">
                      <span className="tag">{c.connection.name}</span>
                      {c.awaitingSince && c.status === 'OPEN' && (
                        <span className={`wait ${level}`} title="Tempo esperando resposta">
                          ⏱ {waitingLabel(c.awaitingSince, now)}
                        </span>
                      )}
                      {c.status === 'CLOSED' && <span className="tag">Encerrada</span>}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="inbox-chat" aria-label="Conversa selecionada">
        {selectedId ? (
          <ChatView key={selectedId} conversationId={selectedId} initial={selected} onBack={() => navigate('/')} />
        ) : (
          <div className="placeholder">
            <p>Selecione uma conversa</p>
            <p className="muted small">As respostas também podem ser feitas direto pelo WhatsApp do celular.</p>
          </div>
        )}
      </section>
    </div>
  );
}
