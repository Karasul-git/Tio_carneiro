import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useSocketEvent } from '../lib/hooks';
import { dateLabel, formatBRL, orderStatusLabel } from '../lib/format';
import type { Order } from '../lib/types';

const FILTERS: { id: string; label: string }[] = [
  { id: 'open', label: 'Em andamento' },
  { id: 'SUBMITTED', label: 'Novos' },
  { id: 'CONFIRMED', label: 'Confirmados' },
  { id: 'IN_PRODUCTION', label: 'Em produção' },
  { id: 'READY', label: 'Prontos' },
  { id: 'DRAFT', label: 'Rascunhos' },
  { id: 'DELIVERED', label: 'Entregues' },
  { id: 'CANCELLED', label: 'Cancelados' },
  { id: 'all', label: 'Todos' },
];

export default function OrdersPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('open');
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ status });
    if (search.trim()) qs.set('search', search.trim());
    const r = await api<{ orders: Order[]; counts: Record<string, number> }>(`/orders?${qs}`);
    setOrders(r.orders);
    setCounts(r.counts);
    setLoading(false);
  }, [status, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  useSocketEvent('order:update', useCallback(() => load(), [load]));

  const create = async () => {
    const o = await api<Order>('/orders', { body: {} });
    navigate(`/pedidos/${o.id}`);
  };

  const countFor = (id: string) =>
    id === 'open'
      ? ['SUBMITTED', 'CONFIRMED', 'IN_PRODUCTION', 'READY'].reduce((s, k) => s + (counts[k] ?? 0), 0)
      : id === 'all'
        ? null
        : (counts[id] ?? 0);

  return (
    <div className="page">
      <header className="page-header">
        <div className="row">
          <h1>Pedidos</h1>
          <button className="btn primary" onClick={create}>
            + Novo pedido
          </button>
        </div>
        <input type="search" placeholder="Buscar por cliente ou nº do pedido" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="tabs" role="tablist">
          {FILTERS.map((f) => {
            const n = countFor(f.id);
            return (
              <button key={f.id} role="tab" aria-selected={status === f.id} className={`tab ${status === f.id ? 'active' : ''}`} onClick={() => setStatus(f.id)}>
                {f.label}
                {n ? ` (${n})` : ''}
              </button>
            );
          })}
        </div>
      </header>

      {loading ? (
        <p className="muted">Carregando…</p>
      ) : orders.length === 0 ? (
        <div className="card empty-state">
          <p>Nenhum pedido aqui.</p>
          <p className="muted small">Envie o link de pedido pela conversa (botão “🧾 Pedido”) ou crie um pedido aqui.</p>
        </div>
      ) : (
        <ul className="order-list">
          {orders.map((o) => {
            const qty = o.items.reduce((s, i) => s + i.quantity, 0);
            const pending = o.items.some((i) => i.unitPriceCents == null);
            return (
              <li key={o.id}>
                <Link to={`/pedidos/${o.id}`} className="card order-card">
                  <div className="row">
                    <strong>#{o.number}</strong>
                    <span className={`status-badge ${o.status.toLowerCase()}`}>{orderStatusLabel[o.status]}</span>
                  </div>
                  <div className="ellipsis">{o.customer?.name ?? o.conversation?.contact.name ?? 'Cliente não informado'}</div>
                  <div className="row muted small">
                    <span>
                      {qty} {qty === 1 ? 'peça' : 'peças'} · {pending && o.items.length ? 'valores a definir' : formatBRL(o.totalCents)}
                    </span>
                    <span>{o.dueDate ? `Prazo ${dateLabel(o.dueDate)}` : new Date(o.updatedAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
