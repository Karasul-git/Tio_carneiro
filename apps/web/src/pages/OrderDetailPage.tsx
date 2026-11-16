import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useSocketEvent } from '../lib/hooks';
import {
  centsToInput,
  dateInput,
  dateLabel,
  formatBRL,
  formatCep,
  formatDocument,
  formatPhone,
  orderStatusLabel,
  parseBRL,
} from '../lib/format';
import type { Order, OrderItem, OrderStatus, Product } from '../lib/types';

/** Próximos passos possíveis a partir de cada situação */
const NEXT: Record<OrderStatus, { to: OrderStatus; label: string; primary?: boolean }[]> = {
  DRAFT: [{ to: 'SUBMITTED', label: 'Marcar como enviado' }],
  SUBMITTED: [{ to: 'CONFIRMED', label: 'Confirmar pedido', primary: true }],
  CONFIRMED: [{ to: 'IN_PRODUCTION', label: 'Iniciar produção', primary: true }],
  IN_PRODUCTION: [{ to: 'READY', label: 'Marcar como pronto', primary: true }],
  READY: [{ to: 'DELIVERED', label: 'Marcar como entregue', primary: true }],
  DELIVERED: [],
  CANCELLED: [{ to: 'SUBMITTED', label: 'Reabrir' }],
};

type EditItem = OrderItem & { priceText: string };

const toEdit = (items: OrderItem[]): EditItem[] => items.map((i) => ({ ...i, priceText: centsToInput(i.unitPriceCents) }));

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<EditItem[]>([]);
  const [extra, setExtra] = useState({ discount: '', shipping: '', dueDate: '', internalNotes: '', deliveryMethod: 'PICKUP' as Order['deliveryMethod'] });
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');
  const [adding, setAdding] = useState({ productId: '', size: '', color: '', quantity: '1' });

  const apply = (o: Order) => {
    setOrder(o);
    setItems(toEdit(o.items));
    setExtra({
      discount: o.discountCents ? centsToInput(o.discountCents) : '',
      shipping: o.shippingCents ? centsToInput(o.shippingCents) : '',
      dueDate: dateInput(o.dueDate),
      internalNotes: o.internalNotes ?? '',
      deliveryMethod: o.deliveryMethod,
    });
    setDirty(false);
  };

  useEffect(() => {
    api<Order>(`/orders/${id}`).then(apply).catch((e) => setMsg(e.message));
    api<Product[]>('/products?active=true').then(setProducts).catch(() => {});
  }, [id]);

  useSocketEvent(
    'order:update',
    useCallback(
      (o: Order) => {
        if (o.id === id && !dirty) apply({ ...o, link: order?.link });
      },
      [id, dirty, order?.link],
    ),
  );

  const totals = useMemo(() => {
    let subtotal = 0;
    let pending = false;
    let qty = 0;
    for (const i of items) {
      const p = parseBRL(i.priceText);
      qty += i.quantity;
      if (p == null) pending = true;
      else subtotal += p * i.quantity;
    }
    const total = Math.max(0, subtotal - (parseBRL(extra.discount) ?? 0)) + (parseBRL(extra.shipping) ?? 0);
    return { subtotal, total, pending, qty };
  }, [items, extra]);

  if (!order) return <div className="page">{msg ? <p className="error">{msg}</p> : <p className="muted">Carregando…</p>}</div>;

  const editItem = (idx: number, patch: Partial<EditItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    setDirty(true);
  };

  const product = products.find((p) => p.id === adding.productId);
  const addItem = () => {
    if (!product) return;
    const surcharge = adding.size && product.sizeSurchargeCents?.[adding.size] ? product.sizeSurchargeCents[adding.size] : 0;
    const price = product.priceCents == null ? null : product.priceCents + surcharge;
    setItems((prev) => [
      ...prev,
      {
        productId: product.id,
        description: product.name,
        size: adding.size || null,
        color: adding.color || null,
        quantity: Math.max(1, Number(adding.quantity) || 1),
        unitPriceCents: price,
        customization: null,
        priceText: centsToInput(price),
      },
    ]);
    setAdding({ productId: '', size: '', color: '', quantity: '1' });
    setDirty(true);
  };

  const save = async (status?: OrderStatus) => {
    setMsg('');
    try {
      const o = await api<Order>(`/orders/${order.id}`, {
        method: 'PATCH',
        body: {
          ...(status ? { status } : {}),
          items: items.map((i) => ({
            productId: i.productId,
            description: i.description,
            size: i.size,
            color: i.color,
            quantity: i.quantity,
            customization: i.customization,
            unitPriceCents: parseBRL(i.priceText),
          })),
          discountCents: parseBRL(extra.discount) ?? 0,
          shippingCents: parseBRL(extra.shipping) ?? 0,
          dueDate: extra.dueDate || null,
          internalNotes: extra.internalNotes || null,
          deliveryMethod: extra.deliveryMethod,
        },
      });
      apply(o);
      setMsg(status ? `Pedido: ${orderStatusLabel[status]}` : 'Salvo ✔');
    } catch (err) {
      setMsg((err as Error).message);
    }
  };

  const share = async () => {
    if (!order.link) return;
    const text = `Pedido #${order.number}: ${order.link}`;
    try {
      if (navigator.share) await navigator.share({ title: `Pedido #${order.number}`, text, url: order.link });
      else {
        await navigator.clipboard.writeText(order.link);
        setMsg('Link copiado ✔');
      }
    } catch {
      /* compartilhamento cancelado */
    }
  };

  const remove = async () => {
    if (!confirm('Excluir este rascunho?')) return;
    await api(`/orders/${order.id}`, { method: 'DELETE' });
    navigate('/pedidos');
  };

  const c = order.customer;
  const editable = order.status !== 'DELIVERED' && order.status !== 'CANCELLED';

  return (
    <div className="page">
      <header className="page-header">
        <Link to="/pedidos" className="muted small">
          ‹ Pedidos
        </Link>
        <div className="row">
          <h1>Pedido #{order.number}</h1>
          <span className={`status-badge ${order.status.toLowerCase()}`}>{orderStatusLabel[order.status]}</span>
        </div>
        <div className="actions">
          {NEXT[order.status].map((n) => (
            <button key={n.to} className={`btn ${n.primary ? 'primary' : ''}`} onClick={() => save(n.to)}>
              {n.label}
            </button>
          ))}
          {order.status !== 'CANCELLED' && order.status !== 'DELIVERED' && order.status !== 'DRAFT' && (
            <button className="btn danger" onClick={() => confirm('Cancelar este pedido?') && save('CANCELLED')}>
              Cancelar pedido
            </button>
          )}
          {order.status === 'DRAFT' && (
            <button className="btn danger" onClick={remove}>
              Excluir rascunho
            </button>
          )}
          <button className="btn" onClick={share}>
            🔗 Link do cliente
          </button>
          {order.conversation && (
            <Link className="btn" to={`/conversas/${order.conversation.id}`}>
              💬 Conversa
            </Link>
          )}
        </div>
        {msg && <p className="small">{msg}</p>}
      </header>

      <section className="card stack">
        <h2>Cliente</h2>
        {c ? (
          <div className="stack tight">
            <strong>{c.name}</strong>
            <span className="muted small">
              {[c.document && `${c.personType === 'PJ' ? 'CNPJ' : 'CPF'} ${formatDocument(c.document)}`, c.phone && formatPhone(c.phone), c.email]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {(c.street || c.city) && (
              <span className="muted small">
                {[c.street && `${c.street}, ${c.number ?? 's/n'}`, c.complement, c.district, c.city && `${c.city}/${c.state ?? ''}`, c.zipCode && `CEP ${formatCep(c.zipCode)}`]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
            <Link to={`/clientes/${c.id}`} className="small link">
              Ver cadastro
            </Link>
          </div>
        ) : (
          <p className="muted">
            {order.conversation?.contact.name ?? 'Ainda não informado'} — os dados chegam quando o cliente envia o pedido pelo link.
          </p>
        )}
        {order.customerNotes && (
          <p className="note">
            <b>Observações do cliente:</b> {order.customerNotes}
          </p>
        )}
        {order.desiredDate && <p className="small">Cliente precisa para: <b>{dateLabel(order.desiredDate)}</b></p>}
      </section>

      <section className="card stack">
        <h2>Itens</h2>
        {items.length === 0 && <p className="muted">Nenhum item.</p>}
        <ul className="item-list">
          {items.map((i, idx) => (
            <li key={idx}>
              <div className="item-desc">
                <strong>{i.description}</strong>
                <span className="muted small">{[i.size && `Tam. ${i.size}`, i.color, i.customization].filter(Boolean).join(' · ')}</span>
              </div>
              <label className="mini">
                Qtd.
                <input
                  type="number"
                  min={1}
                  value={i.quantity}
                  disabled={!editable}
                  onChange={(e) => editItem(idx, { quantity: Math.max(1, Math.floor(Number(e.target.value)) || 1) })}
                />
              </label>
              <label className="mini">
                Preço un.
                <input value={i.priceText} placeholder="a definir" disabled={!editable} inputMode="decimal" onChange={(e) => editItem(idx, { priceText: e.target.value })} />
              </label>
              {editable && (
                <button
                  className="icon-btn small-x"
                  aria-label="Remover item"
                  onClick={() => {
                    setItems((prev) => prev.filter((_, k) => k !== idx));
                    setDirty(true);
                  }}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>

        {editable && (
          <div className="add-item">
            <select value={adding.productId} onChange={(e) => setAdding({ productId: e.target.value, size: '', color: '', quantity: '1' })} aria-label="Produto">
              <option value="">+ Adicionar produto…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {product && (
              <div className="row gap">
                {product.sizes.length > 0 && (
                  <select value={adding.size} onChange={(e) => setAdding({ ...adding, size: e.target.value })} aria-label="Tamanho">
                    <option value="">Tamanho</option>
                    {product.sizes.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                )}
                {product.colors.length > 0 && (
                  <select value={adding.color} onChange={(e) => setAdding({ ...adding, color: e.target.value })} aria-label="Cor">
                    <option value="">Cor</option>
                    {product.colors.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                )}
                <input className="qty" type="number" min={1} value={adding.quantity} onChange={(e) => setAdding({ ...adding, quantity: e.target.value })} aria-label="Quantidade" />
                <button className="btn" onClick={addItem} disabled={product.sizes.length > 0 && !adding.size}>
                  Adicionar
                </button>
              </div>
            )}
          </div>
        )}

        <div className="two-cols">
          <label>
            Desconto (R$)
            <input inputMode="decimal" value={extra.discount} disabled={!editable} onChange={(e) => (setExtra({ ...extra, discount: e.target.value }), setDirty(true))} />
          </label>
          <label>
            Frete (R$)
            <input inputMode="decimal" value={extra.shipping} disabled={!editable} onChange={(e) => (setExtra({ ...extra, shipping: e.target.value }), setDirty(true))} />
          </label>
        </div>
        <p className="total">
          {totals.qty} peças · Total {formatBRL(totals.total)}
          {totals.pending && <span className="pill warn">há itens sem preço</span>}
        </p>
      </section>

      <section className="card stack">
        <h2>Entrega e produção</h2>
        <div className="chips">
          {(['PICKUP', 'DELIVERY'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`chip ${extra.deliveryMethod === m ? 'on' : ''}`}
              disabled={!editable}
              onClick={() => (setExtra({ ...extra, deliveryMethod: m }), setDirty(true))}
            >
              {m === 'PICKUP' ? 'Retirada' : 'Entrega'}
            </button>
          ))}
        </div>
        <label>
          Prazo combinado
          <input type="date" value={extra.dueDate} onChange={(e) => (setExtra({ ...extra, dueDate: e.target.value }), setDirty(true))} />
        </label>
        <label>
          Anotações internas (o cliente não vê)
          <textarea rows={3} value={extra.internalNotes} onChange={(e) => (setExtra({ ...extra, internalNotes: e.target.value }), setDirty(true))} />
        </label>
        <p className="muted small">
          Criado em {new Date(order.createdAt).toLocaleString('pt-BR')}
          {order.createdBy && ` por ${order.createdBy.name}`}
          {order.connection && ` · ${order.connection.name}`}
        </p>
      </section>

      {dirty && (
        <div className="save-bar">
          <span className="small">Alterações não salvas</span>
          <button className="btn" onClick={() => apply(order)}>
            Desfazer
          </button>
          <button className="btn primary" onClick={() => save()}>
            Salvar
          </button>
        </div>
      )}
    </div>
  );
}
