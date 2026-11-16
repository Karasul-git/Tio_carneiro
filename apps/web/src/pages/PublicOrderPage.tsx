import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { dateInput, formatBRL, orderStatusLabel } from '../lib/format';

/** Página que o cliente abre pelo link enviado no WhatsApp (sem login). */

type PublicProduct = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  imageUrl: string | null;
  sizes: string[];
  colors: string[];
  minQuantity: number;
  customizable: boolean;
  priceCents: number | null;
  sizeSurchargeCents: Record<string, number> | null;
};

type CartItem = {
  productId: string;
  size: string | null;
  color: string | null;
  quantity: number;
  customization: string | null;
};

type CustomerForm = Record<
  | 'name'
  | 'document'
  | 'email'
  | 'phone'
  | 'stateRegistration'
  | 'zipCode'
  | 'street'
  | 'number'
  | 'complement'
  | 'district'
  | 'city'
  | 'state'
  | 'cityCode',
  string
>;

type PublicData = {
  company: { name: string; intro: string; showPrices: boolean };
  order: {
    number: number;
    status: string;
    editable: boolean;
    deliveryMethod: 'PICKUP' | 'DELIVERY';
    desiredDate: string | null;
    dueDate: string | null;
    notes: string;
    customer: CustomerForm;
    items: (CartItem & { description: string; unitPriceCents: number | null })[];
    totalCents?: number;
  };
  products: PublicProduct[];
};

const emptyCustomer: CustomerForm = {
  name: '', document: '', email: '', phone: '', stateRegistration: '', zipCode: '', street: '',
  number: '', complement: '', district: '', city: '', state: '', cityCode: '',
};

function priceFor(p: PublicProduct, size: string | null) {
  if (p.priceCents == null) return null;
  return p.priceCents + (size && p.sizeSurchargeCents?.[size] ? p.sizeSurchargeCents[size] : 0);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/public${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issue = (data as any)?.details?.[0];
    throw new Error(issue ? `Confira o campo "${issue.path?.join('.')}"` : ((data as any)?.error ?? 'Erro ao enviar'));
  }
  return data as T;
}

function ProductCard({ product, showPrices, onAdd }: { product: PublicProduct; showPrices: boolean; onAdd: (items: CartItem[]) => void }) {
  const [color, setColor] = useState<string | null>(product.colors[0] ?? null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [customization, setCustomization] = useState('');
  const sizes = product.sizes.length ? product.sizes : [''];
  const total = sizes.reduce((s, z) => s + (Number(qty[z]) || 0), 0);

  const add = () => {
    const items = sizes
      .filter((z) => Number(qty[z]) > 0)
      .map((z) => ({
        productId: product.id,
        size: z || null,
        color,
        quantity: Math.floor(Number(qty[z])),
        customization: customization.trim() || null,
      }));
    if (!items.length) return;
    onAdd(items);
    setQty({});
  };

  const base = priceFor(product, null);
  return (
    <article className="card product">
      {product.imageUrl && <img src={product.imageUrl} alt="" className="product-img" loading="lazy" />}
      <div className="stack tight">
        <div className="row">
          <h3>{product.name}</h3>
          {showPrices && <span className="price">{base == null ? 'Sob orçamento' : formatBRL(base)}</span>}
        </div>
        {product.description && <p className="muted small">{product.description}</p>}
        {product.minQuantity > 1 && <p className="small muted">Pedido mínimo: {product.minQuantity} peças</p>}
        {showPrices && product.sizeSurchargeCents && Object.keys(product.sizeSurchargeCents).length > 0 && (
          <p className="small muted">
            {Object.entries(product.sizeSurchargeCents)
              .map(([s, c]) => `${s}: +${formatBRL(c)}`)
              .join(' · ')}
          </p>
        )}
      </div>

      {product.colors.length > 0 && (
        <div className="chips" role="radiogroup" aria-label="Cor">
          {product.colors.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={color === c} className={`chip ${color === c ? 'on' : ''}`} onClick={() => setColor(c)}>
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="size-grid">
        {sizes.map((z) => (
          <label key={z || 'qty'} className="size-cell">
            <span>{z || 'Quantidade'}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="0"
              value={qty[z] ?? ''}
              onChange={(e) => setQty({ ...qty, [z]: e.target.value })}
              aria-label={z ? `Quantidade tamanho ${z}` : 'Quantidade'}
            />
          </label>
        ))}
      </div>

      {product.customizable && (
        <label>
          Personalização (opcional)
          <input value={customization} onChange={(e) => setCustomization(e.target.value)} placeholder="Ex.: logo no peito, nome nas costas" />
        </label>
      )}

      <button type="button" className="btn primary" disabled={total <= 0} onClick={add}>
        {total > 0 ? `Adicionar ${total} ${total === 1 ? 'peça' : 'peças'}` : 'Escolha as quantidades'}
      </button>
    </article>
  );
}

export default function PublicOrderPage() {
  const { token } = useParams();
  const [data, setData] = useState<PublicData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<CustomerForm>(emptyCustomer);
  const [delivery, setDelivery] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [desiredDate, setDesiredDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const [category, setCategory] = useState('');

  useEffect(() => {
    request<PublicData>(`/orders/${token}`)
      .then((d) => {
        setData(d);
        setCart(d.order.items.filter((i) => i.productId).map(({ productId, size, color, quantity, customization }) => ({ productId: productId!, size, color, quantity, customization })));
        setCustomer({ ...emptyCustomer, ...Object.fromEntries(Object.entries(d.order.customer ?? {}).map(([k, v]) => [k, v ?? ''])) });
        setDelivery(d.order.deliveryMethod);
        setDesiredDate(dateInput(d.order.desiredDate));
        setNotes(d.order.notes ?? '');
        document.title = `Pedido #${d.order.number} · ${d.company.name}`;
      })
      .catch((e) => setLoadError(e.message));
  }, [token]);

  const products = useMemo(() => new Map((data?.products ?? []).map((p) => [p.id, p])), [data]);
  const categories = useMemo(() => [...new Set((data?.products ?? []).map((p) => p.category || 'Outros'))], [data]);

  const addItems = (items: CartItem[]) => {
    setCart((prev) => {
      const next = [...prev];
      for (const it of items) {
        const same = next.find((c) => c.productId === it.productId && c.size === it.size && c.color === it.color && c.customization === it.customization);
        if (same) same.quantity += it.quantity;
        else next.push({ ...it });
      }
      return next;
    });
  };

  const setQty = (idx: number, q: number) =>
    setCart((prev) => (q <= 0 ? prev.filter((_, i) => i !== idx) : prev.map((c, i) => (i === idx ? { ...c, quantity: q } : c))));

  const showPrices = data?.company.showPrices ?? false;
  const totals = useMemo(() => {
    let total = 0;
    let pending = false;
    let qty = 0;
    for (const c of cart) {
      const p = products.get(c.productId);
      const price = p ? priceFor(p, c.size) : null;
      qty += c.quantity;
      if (price == null) pending = true;
      else total += price * c.quantity;
    }
    return { total, pending, qty };
  }, [cart, products]);

  async function lookupCep(cep: string) {
    const d = cep.replace(/\D/g, '');
    if (d.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = await r.json();
      if (j.erro) return;
      setCustomer((c) => ({
        ...c,
        street: c.street || j.logradouro || '',
        district: c.district || j.bairro || '',
        city: j.localidade || c.city,
        state: j.uf || c.state,
        cityCode: j.ibge || c.cityCode,
      }));
    } catch {
      /* sem internet ou serviço fora do ar: o cliente preenche à mão */
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!cart.length) {
      setError('Adicione pelo menos um produto ao pedido.');
      return;
    }
    setSending(true);
    try {
      const r = await request<{ number: number }>(`/orders/${token}`, {
        method: 'PUT',
        body: JSON.stringify({
          items: cart,
          customer,
          deliveryMethod: delivery,
          desiredDate: desiredDate || null,
          notes,
        }),
      });
      setSent(r.number);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (loadError) {
    return (
      <div className="public">
        <div className="card public-msg">
          <h1>Ops!</h1>
          <p>{loadError}</p>
          <p className="muted">Peça um novo link pelo WhatsApp.</p>
        </div>
      </div>
    );
  }
  if (!data) return <div className="splash">Carregando…</div>;

  const { company, order } = data;

  if (sent) {
    return (
      <div className="public">
        <div className="card public-msg">
          <div className="big-emoji" aria-hidden="true">✅</div>
          <h1>Pedido #{sent} enviado!</h1>
          <p>Obrigado! Nossa equipe vai conferir e retornar pelo WhatsApp.</p>
          <p className="muted small">Se precisar mudar algo, abra este mesmo link antes da confirmação.</p>
          <button className="btn" onClick={() => setSent(null)}>
            Ver ou alterar o pedido
          </button>
        </div>
      </div>
    );
  }

  if (!order.editable) {
    return (
      <div className="public">
        <header className="public-header">
          <h1>{company.name}</h1>
          <p>
            Pedido <b>#{order.number}</b> · <span className="pill">{orderStatusLabel[order.status]}</span>
          </p>
        </header>
        <div className="card stack">
          <h2>Itens</h2>
          <ul className="cart">
            {order.items.map((i, idx) => (
              <li key={idx}>
                <span>
                  {i.quantity}× {i.description}
                  {i.size ? ` · ${i.size}` : ''}
                  {i.color ? ` · ${i.color}` : ''}
                </span>
              </li>
            ))}
          </ul>
          {order.totalCents != null && <p className="total">Total: {formatBRL(order.totalCents)}</p>}
          <p className="muted small">Este pedido já foi confirmado. Para alterações, fale com a gente pelo WhatsApp.</p>
        </div>
      </div>
    );
  }

  const shown = data.products.filter((p) => !category || (p.category || 'Outros') === category);

  return (
    <div className="public">
      <header className="public-header">
        <h1>{company.name}</h1>
        <p className="muted">
          Pedido #{order.number}
          {order.status === 'SUBMITTED' && ' · já enviado (você ainda pode alterar)'}
        </p>
        <p>{company.intro}</p>
      </header>

      {data.products.length === 0 ? (
        <div className="card">
          <p>O catálogo ainda está sendo preparado. Fale com a gente pelo WhatsApp que montamos o pedido para você. 😊</p>
        </div>
      ) : (
        <>
          {categories.length > 1 && (
            <div className="tabs public-tabs" role="tablist">
              <button role="tab" aria-selected={!category} className={`tab ${!category ? 'active' : ''}`} onClick={() => setCategory('')}>
                Todos
              </button>
              {categories.map((c) => (
                <button key={c} role="tab" aria-selected={category === c} className={`tab ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}
          <section className="product-grid" aria-label="Produtos">
            {shown.map((p) => (
              <ProductCard key={p.id} product={p} showPrices={showPrices} onAdd={addItems} />
            ))}
          </section>
        </>
      )}

      <form className="stack" onSubmit={submit}>
        <section className="card stack" aria-label="Seu pedido">
          <h2>Seu pedido</h2>
          {cart.length === 0 ? (
            <p className="muted">Nenhum produto ainda. Escolha as quantidades acima e toque em “Adicionar”.</p>
          ) : (
            <ul className="cart">
              {cart.map((c, idx) => {
                const p = products.get(c.productId);
                const price = p ? priceFor(p, c.size) : null;
                return (
                  <li key={idx}>
                    <div className="cart-desc">
                      <strong>{p?.name ?? 'Produto indisponível'}</strong>
                      <span className="muted small">
                        {[c.size && `Tam. ${c.size}`, c.color, c.customization].filter(Boolean).join(' · ')}
                        {showPrices && price != null && ` · ${formatBRL(price)} cada`}
                      </span>
                    </div>
                    <div className="stepper">
                      <button type="button" aria-label="Menos" onClick={() => setQty(idx, c.quantity - 1)}>
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={c.quantity}
                        onChange={(e) => setQty(idx, Math.floor(Number(e.target.value)) || 0)}
                        aria-label="Quantidade"
                      />
                      <button type="button" aria-label="Mais" onClick={() => setQty(idx, c.quantity + 1)}>
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {cart.length > 0 && (
            <p className="total">
              {totals.qty} {totals.qty === 1 ? 'peça' : 'peças'}
              {showPrices && (
                <>
                  {' · '}
                  {totals.pending ? `${formatBRL(totals.total)} + itens sob orçamento` : formatBRL(totals.total)}
                </>
              )}
            </p>
          )}
          {showPrices && <p className="muted small">Valores de referência. A confecção confirma o total final, frete e prazo.</p>}
        </section>

        <section className="card stack" aria-label="Seus dados">
          <h2>Seus dados</h2>
          <label>
            Nome completo ou razão social *
            <input required minLength={2} autoComplete="name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
          </label>
          <label>
            CPF ou CNPJ (para a nota fiscal)
            <input inputMode="numeric" value={customer.document} onChange={(e) => setCustomer({ ...customer, document: e.target.value })} />
          </label>
          {customer.document.replace(/\D/g, '').length === 14 && (
            <label>
              Inscrição estadual
              <input value={customer.stateRegistration} onChange={(e) => setCustomer({ ...customer, stateRegistration: e.target.value })} placeholder="Ou “isento”" />
            </label>
          )}
          <div className="two-cols">
            <label>
              Telefone
              <input type="tel" autoComplete="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
            </label>
            <label>
              E-mail
              <input type="email" autoComplete="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
            </label>
          </div>
        </section>

        <section className="card stack" aria-label="Entrega">
          <h2>Entrega</h2>
          <div className="chips">
            <button type="button" className={`chip ${delivery === 'PICKUP' ? 'on' : ''}`} onClick={() => setDelivery('PICKUP')}>
              Vou retirar
            </button>
            <button type="button" className={`chip ${delivery === 'DELIVERY' ? 'on' : ''}`} onClick={() => setDelivery('DELIVERY')}>
              Quero receber
            </button>
          </div>
          {(delivery === 'DELIVERY' || customer.document.replace(/\D/g, '').length >= 11) && (
            <>
              <p className="muted small">{delivery === 'DELIVERY' ? 'Endereço de entrega' : 'Endereço (usado na nota fiscal)'}</p>
              <div className="two-cols">
                <label>
                  CEP
                  <input
                    inputMode="numeric"
                    autoComplete="postal-code"
                    value={customer.zipCode}
                    onChange={(e) => setCustomer({ ...customer, zipCode: e.target.value })}
                    onBlur={(e) => lookupCep(e.target.value)}
                    required={delivery === 'DELIVERY'}
                  />
                </label>
                <label>
                  Número
                  <input value={customer.number} onChange={(e) => setCustomer({ ...customer, number: e.target.value })} required={delivery === 'DELIVERY'} />
                </label>
              </div>
              <label>
                Rua
                <input autoComplete="address-line1" value={customer.street} onChange={(e) => setCustomer({ ...customer, street: e.target.value })} required={delivery === 'DELIVERY'} />
              </label>
              <div className="two-cols">
                <label>
                  Complemento
                  <input value={customer.complement} onChange={(e) => setCustomer({ ...customer, complement: e.target.value })} />
                </label>
                <label>
                  Bairro
                  <input value={customer.district} onChange={(e) => setCustomer({ ...customer, district: e.target.value })} />
                </label>
              </div>
              <div className="two-cols">
                <label>
                  Cidade
                  <input value={customer.city} onChange={(e) => setCustomer({ ...customer, city: e.target.value, cityCode: '' })} required={delivery === 'DELIVERY'} />
                </label>
                <label>
                  UF
                  <input maxLength={2} value={customer.state} onChange={(e) => setCustomer({ ...customer, state: e.target.value.toUpperCase() })} required={delivery === 'DELIVERY'} />
                </label>
              </div>
            </>
          )}
          <label>
            Para quando você precisa? (opcional)
            <input type="date" value={desiredDate} onChange={(e) => setDesiredDate(e.target.value)} />
          </label>
          <label>
            Observações
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalhes da personalização, arte, dúvidas…" />
          </label>
        </section>

        {error && <p className="error card">{error}</p>}
        <div className="public-submit">
          <button className="btn primary big" disabled={sending}>
            {sending ? 'Enviando…' : order.status === 'SUBMITTED' ? 'Atualizar pedido' : 'Enviar pedido'}
          </button>
        </div>
      </form>
    </div>
  );
}
