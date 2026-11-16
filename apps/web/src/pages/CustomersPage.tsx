import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatBRL, formatDocument, formatPhone, orderStatusLabel } from '../lib/format';
import type { Customer, Order } from '../lib/types';

export function CustomersPage() {
  const [items, setItems] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => api<Customer[]>(`/customers?search=${encodeURIComponent(search)}`).then(setItems), 250);
    return () => clearTimeout(t);
  }, [search]);
  return (
    <div className="page">
      <header className="page-header">
        <h1>Clientes</h1>
        <p className="muted">O cadastro é criado automaticamente quando o cliente envia um pedido pelo link.</p>
        <input type="search" placeholder="Buscar por nome, CPF/CNPJ ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} />
      </header>
      {items.length === 0 ? (
        <div className="card empty-state">
          <p className="muted">Nenhum cliente encontrado.</p>
        </div>
      ) : (
        <ul className="order-list">
          {items.map((c) => (
            <li key={c.id}>
              <Link to={`/clientes/${c.id}`} className="card order-card">
                <div className="row">
                  <strong className="ellipsis">{c.name}</strong>
                  <span className="tag">{c.personType}</span>
                </div>
                <div className="muted small">
                  {[formatDocument(c.document), formatPhone(c.phone), c.city && `${c.city}/${c.state ?? ''}`].filter(Boolean).join(' · ') || '—'}
                </div>
                <div className="muted small">{c._count?.orders ?? 0} pedido(s)</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type CustomerDetail = Customer & { orders: Order[] };
const FIELDS: [keyof Customer, string, string?][] = [
  ['name', 'Nome / razão social'],
  ['document', 'CPF / CNPJ', 'numeric'],
  ['stateRegistration', 'Inscrição estadual'],
  ['phone', 'Telefone', 'tel'],
  ['email', 'E-mail', 'email'],
  ['zipCode', 'CEP', 'numeric'],
  ['street', 'Rua'],
  ['number', 'Número'],
  ['complement', 'Complemento'],
  ['district', 'Bairro'],
  ['city', 'Cidade'],
  ['state', 'UF'],
  ['cityCode', 'Código IBGE do município', 'numeric'],
];

export function CustomerDetailPage() {
  const { id } = useParams();
  const [c, setC] = useState<CustomerDetail | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api<CustomerDetail>(`/customers/${id}`).then((d) => {
      setC(d);
      setForm(Object.fromEntries(FIELDS.map(([k]) => [k, String(d[k] ?? '')]).concat([['notes', d.notes ?? '']])));
    });
  }, [id]);

  if (!c) return <div className="page muted">Carregando…</div>;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setMsg('');
    try {
      await api(`/customers/${c.id}`, { method: 'PATCH', body: form });
      setMsg('Salvo ✔');
    } catch (err) {
      setMsg((err as Error).message);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <Link to="/clientes" className="muted small">
          ‹ Clientes
        </Link>
        <h1>{c.name}</h1>
      </header>
      <form className="card stack" onSubmit={save}>
        <h2>Cadastro</h2>
        <div className="form-grid">
          {FIELDS.map(([k, label, mode]) => (
            <label key={k}>
              {label}
              <input
                value={form[k] ?? ''}
                inputMode={mode === 'numeric' ? 'numeric' : undefined}
                type={mode === 'email' ? 'email' : mode === 'tel' ? 'tel' : 'text'}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                required={k === 'name'}
              />
            </label>
          ))}
        </div>
        <label>
          Observações
          <textarea rows={2} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
        {msg && <p className="small">{msg}</p>}
        <button className="btn primary">Salvar</button>
      </form>
      <section className="stack">
        <h2>Pedidos</h2>
        {c.orders.length === 0 && <p className="muted">Nenhum pedido.</p>}
        <ul className="order-list">
          {c.orders.map((o) => (
            <li key={o.id}>
              <Link to={`/pedidos/${o.id}`} className="card order-card">
                <div className="row">
                  <strong>#{o.number}</strong>
                  <span className={`status-badge ${o.status.toLowerCase()}`}>{orderStatusLabel[o.status]}</span>
                </div>
                <div className="muted small">
                  {new Date(o.createdAt).toLocaleDateString('pt-BR')} · {formatBRL(o.totalCents)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
