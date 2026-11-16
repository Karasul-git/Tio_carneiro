import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useSocketEvent } from '../lib/hooks';
import { formatPhone, statusLabel } from '../lib/format';
import type { Connection, User } from '../lib/types';

const MAX = 5;

export default function ConnectionsPage() {
  const [items, setItems] = useState<Connection[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const list = await api<Connection[]>('/connections');
    setItems(list);
    for (const c of list.filter((c) => c.status === 'QR')) {
      api<{ qr: string | null }>(`/connections/${c.id}/qr`).then(({ qr }) => {
        if (qr) setQrs((p) => ({ ...p, [c.id]: qr }));
      });
    }
  }, []);

  useEffect(() => {
    load();
    api<User[]>('/users').then(setUsers).catch(() => {});
  }, [load]);

  useSocketEvent(
    'connection:update',
    useCallback((c: Connection) => {
      setItems((prev) => prev.map((p) => (p.id === c.id ? { ...p, ...c } : p)));
      if (c.status !== 'QR') setQrs((p) => ({ ...p, [c.id]: '' }));
    }, []),
  );
  useSocketEvent(
    'connection:qr',
    useCallback(({ id, qr }: { id: string; qr: string }) => setQrs((p) => ({ ...p, [id]: qr })), []),
  );

  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    run(async () => {
      await api('/connections', { body: { name: name.trim() } });
      setName('');
    });
  };

  const attendants = users.filter((u) => u.active !== false);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Números de WhatsApp</h1>
        <p className="muted">
          Conecte até {MAX} números. No celular do atendente: WhatsApp → <b>Aparelhos conectados</b> →{' '}
          <b>Conectar um aparelho</b> e leia o QR Code.
        </p>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="grid">
        {items.map((c) => (
          <article className="card conn" key={c.id}>
            <div className="row">
              <h2 className="ellipsis">{c.name}</h2>
              <span className={`status ${c.status.toLowerCase()}`}>{statusLabel[c.status]}</span>
            </div>
            {c.phone && <p className="muted">{formatPhone(c.phone)}</p>}
            {c.lastError && c.status !== 'CONNECTED' && <p className="error small">{c.lastError}</p>}

            {c.status === 'QR' && qrs[c.id] && (
              <div className="qr">
                <img src={qrs[c.id]} alt={`QR Code para conectar ${c.name}`} />
                <p className="small muted">O código muda a cada poucos segundos.</p>
              </div>
            )}

            <label>
              Atendente responsável
              <select
                value={c.attendantId ?? ''}
                onChange={(e) =>
                  run(() =>
                    api(`/connections/${c.id}`, { method: 'PATCH', body: { attendantId: e.target.value || null } }),
                  )
                }
              >
                <option value="">— Nenhum (gestores recebem os avisos) —</option>
                {attendants.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={c.botEnabled}
                onChange={(e) =>
                  run(() => api(`/connections/${c.id}`, { method: 'PATCH', body: { botEnabled: e.target.checked } }))
                }
              />
              Robô de triagem ativo neste número
            </label>

            <div className="actions">
              {(c.status === 'DISCONNECTED' || c.status === 'LOGGED_OUT') && (
                <button className="btn primary" onClick={() => run(() => api(`/connections/${c.id}/start`, { body: {} }))}>
                  Conectar
                </button>
              )}
              {(c.status === 'CONNECTED' || c.status === 'CONNECTING' || c.status === 'QR') && (
                <button className="btn" onClick={() => run(() => api(`/connections/${c.id}/stop`, { body: {} }))}>
                  Pausar
                </button>
              )}
              {c.status === 'CONNECTED' && (
                <button
                  className="btn"
                  onClick={() =>
                    confirm('Desconectar este aparelho do WhatsApp? Será preciso ler o QR Code de novo.') &&
                    run(() => api(`/connections/${c.id}/logout`, { body: {} }))
                  }
                >
                  Desconectar aparelho
                </button>
              )}
              <button
                className="btn danger"
                onClick={() =>
                  confirm(`Excluir "${c.name}" e todo o histórico de conversas dele?`) &&
                  run(() => api(`/connections/${c.id}`, { method: 'DELETE' }))
                }
              >
                Excluir
              </button>
            </div>
          </article>
        ))}

        {items.length < MAX && (
          <form className="card conn new" onSubmit={create}>
            <h2>Adicionar número</h2>
            <label>
              Nome de identificação
              <input placeholder="Ex.: Maria – Vendas" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <button className="btn primary" disabled={!name.trim()}>
              Adicionar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
