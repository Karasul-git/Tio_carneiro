import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { centsToInput, formatBRL, parseBRL } from '../lib/format';
import type { Product } from '../lib/types';

type Form = {
  name: string;
  category: string;
  description: string;
  price: string;
  sizes: string;
  colors: string;
  surcharge: string;
  minQuantity: string;
  customizable: boolean;
  imageUrl: string;
  active: boolean;
  sku: string;
  ncm: string;
  cfop: string;
  origin: string;
  unit: string;
};

const empty: Form = {
  name: '', category: '', description: '', price: '', sizes: 'P, M, G, GG', colors: '', surcharge: '',
  minQuantity: '1', customizable: false, imageUrl: '', active: true, sku: '', ncm: '', cfop: '', origin: '0', unit: 'UN',
};

const splitList = (s: string) => s.split(/[,;/]/).map((x) => x.trim()).filter(Boolean);

/** "GG=5; XG=8,50" → { GG: 500, XG: 850 } */
function parseSurcharge(s: string): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const part of s.split(';')) {
    const [size, value] = part.split('=').map((x) => x?.trim());
    const cents = value ? parseBRL(value) : null;
    if (size && cents != null) out[size] = cents;
  }
  return Object.keys(out).length ? out : null;
}

const surchargeText = (r: Record<string, number> | null) =>
  r ? Object.entries(r).map(([k, v]) => `${k}=${centsToInput(v)}`).join('; ') : '';

function toForm(p: Product): Form {
  return {
    name: p.name, category: p.category ?? '', description: p.description ?? '', price: centsToInput(p.priceCents),
    sizes: p.sizes.join(', '), colors: p.colors.join(', '), surcharge: surchargeText(p.sizeSurchargeCents),
    minQuantity: String(p.minQuantity), customizable: p.customizable, imageUrl: p.imageUrl ?? '', active: p.active,
    sku: p.sku ?? '', ncm: p.ncm ?? '', cfop: p.cfop ?? '', origin: String(p.origin ?? 0), unit: p.unit,
  };
}

function toBody(f: Form) {
  return {
    name: f.name,
    category: f.category || null,
    description: f.description || null,
    priceCents: parseBRL(f.price),
    sizes: splitList(f.sizes),
    colors: splitList(f.colors),
    sizeSurchargeCents: parseSurcharge(f.surcharge),
    minQuantity: Math.max(1, Number(f.minQuantity) || 1),
    customizable: f.customizable,
    imageUrl: f.imageUrl,
    active: f.active,
    sku: f.sku || null,
    ncm: f.ncm.replace(/\D/g, ''),
    cfop: f.cfop.replace(/\D/g, ''),
    origin: Number(f.origin) || 0,
    unit: f.unit || 'UN',
  };
}

/** Linhas coladas de uma planilha: nome; categoria; preço; tamanhos; cores; NCM (tab ou ;) */
function parseSheet(text: string) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => line.split(line.includes('\t') ? '\t' : ';').map((c) => c.trim()))
    .filter((cols) => cols[0] && !/^nome$/i.test(cols[0]))
    .map(([name, category, price, sizes, colors, ncm]) =>
      toBody({ ...empty, name, category: category ?? '', price: price ?? '', sizes: sizes ?? '', colors: colors ?? '', ncm: ncm ?? '' }),
    );
}

export default function ProductsPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [showFiscal, setShowFiscal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sheet, setSheet] = useState('');
  const [msg, setMsg] = useState('');
  const [filter, setFilter] = useState('');

  const load = () => api<Product[]>('/products').then(setItems);
  useEffect(() => {
    load();
  }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setMsg('');
    try {
      if (editing === 'new') await api('/products', { body: toBody(form) });
      else await api(`/products/${editing}`, { method: 'PATCH', body: toBody(form) });
      setEditing(null);
      load();
    } catch (err) {
      setMsg((err as Error).message === 'Dados inválidos' ? 'Confira os campos (NCM com 8 dígitos, CFOP com 4, link da imagem…).' : (err as Error).message);
    }
  };

  const doImport = async () => {
    setMsg('');
    const rows = parseSheet(sheet);
    if (!rows.length) return setMsg('Nenhuma linha reconhecida.');
    try {
      const r = await api<{ created: number }>('/products/import', { body: rows });
      setMsg(`${r.created} produtos importados ✔`);
      setSheet('');
      setImporting(false);
      load();
    } catch (err) {
      setMsg((err as Error).message);
    }
  };

  const remove = async (p: Product) => {
    if (!confirm(`Excluir "${p.name}"?`)) return;
    const r = await api<{ deactivated?: boolean }>(`/products/${p.id}`, { method: 'DELETE' });
    if (r.deactivated) setMsg('Esse produto já está em pedidos, então foi apenas desativado.');
    load();
  };

  const shown = items.filter((p) => `${p.name} ${p.category ?? ''} ${p.sku ?? ''}`.toLowerCase().includes(filter.toLowerCase()));
  const groups = shown.reduce<Record<string, Product[]>>((acc, p) => {
    (acc[p.category || 'Sem categoria'] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="page">
      <header className="page-header">
        <div className="row">
          <h1>Produtos</h1>
          <div className="row gap">
            <button className="btn" onClick={() => setImporting(!importing)}>
              Importar planilha
            </button>
            <button className="btn primary" onClick={() => (setEditing('new'), setForm(empty), setShowFiscal(false))}>
              + Novo
            </button>
          </div>
        </div>
        <p className="muted">O catálogo aparece na página de pedido que o cliente recebe pelo WhatsApp. Só produtos ativos aparecem.</p>
        {msg && <p className="small">{msg}</p>}
      </header>

      {importing && (
        <section className="card stack">
          <h2>Importar da planilha</h2>
          <p className="muted small">
            Copie as linhas da planilha e cole abaixo. Colunas, nesta ordem: <b>nome · categoria · preço · tamanhos · cores · NCM</b>. Tamanhos e cores
            separados por vírgula (ex.: “P, M, G”).
          </p>
          <textarea rows={6} value={sheet} onChange={(e) => setSheet(e.target.value)} placeholder={'Camiseta básica\tCamisetas\t35,00\tP, M, G, GG\tPreta, Branca\t61091000'} />
          <p className="small muted">{parseSheet(sheet).length} produto(s) reconhecido(s)</p>
          <div className="actions">
            <button className="btn primary" onClick={doImport}>
              Importar
            </button>
            <button className="btn" onClick={() => setImporting(false)}>
              Cancelar
            </button>
          </div>
        </section>
      )}

      {editing && (
        <form className="card stack" onSubmit={save}>
          <h2>{editing === 'new' ? 'Novo produto' : 'Editar produto'}</h2>
          <label>
            Nome *
            <input required minLength={2} value={form.name} onChange={(e) => set('name', e.target.value)} />
          </label>
          <div className="two-cols">
            <label>
              Categoria
              <input value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="Ex.: Camisetas" list="categories" />
              <datalist id="categories">
                {[...new Set(items.map((i) => i.category).filter(Boolean))].map((c) => (
                  <option key={c!} value={c!} />
                ))}
              </datalist>
            </label>
            <label>
              Preço (R$)
              <input inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="Vazio = sob orçamento" />
            </label>
          </div>
          <label>
            Descrição
            <textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Tecido, gramatura, detalhes…" />
          </label>
          <label>
            Tamanhos (separados por vírgula)
            <input value={form.sizes} onChange={(e) => set('sizes', e.target.value)} placeholder="P, M, G, GG — vazio = sem grade" />
          </label>
          <label>
            Cores (separadas por vírgula)
            <input value={form.colors} onChange={(e) => set('colors', e.target.value)} placeholder="Preta, Branca, Azul marinho" />
          </label>
          <label>
            Acréscimo por tamanho
            <input value={form.surcharge} onChange={(e) => set('surcharge', e.target.value)} placeholder="Ex.: GG=5; XG=8,50" />
          </label>
          <div className="two-cols">
            <label>
              Pedido mínimo (peças)
              <input type="number" min={1} value={form.minQuantity} onChange={(e) => set('minQuantity', e.target.value)} />
            </label>
            <label>
              Link da foto
              <input type="url" value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} placeholder="https://…" />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={form.customizable} onChange={(e) => set('customizable', e.target.checked)} />
            Aceita personalização (estampa, bordado, logo)
          </label>
          <label className="check">
            <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
            Ativo (aparece para o cliente)
          </label>
          <button type="button" className="summary-toggle" onClick={() => setShowFiscal(!showFiscal)}>
            {showFiscal ? '▾' : '▸'} Dados fiscais (para a nota fiscal)
          </button>
          {showFiscal && (
            <div className="stack">
              <p className="muted small">Confirme com a contabilidade. Ex.: camiseta de algodão de malha costuma ser NCM 6109.10.00.</p>
              <div className="two-cols">
                <label>
                  NCM (8 dígitos)
                  <input inputMode="numeric" value={form.ncm} onChange={(e) => set('ncm', e.target.value)} />
                </label>
                <label>
                  CFOP padrão
                  <input inputMode="numeric" value={form.cfop} onChange={(e) => set('cfop', e.target.value)} placeholder="Ex.: 5101" />
                </label>
              </div>
              <div className="two-cols">
                <label>
                  Origem
                  <select value={form.origin} onChange={(e) => set('origin', e.target.value)}>
                    <option value="0">0 - Nacional</option>
                    <option value="1">1 - Estrangeira (importação direta)</option>
                    <option value="2">2 - Estrangeira (mercado interno)</option>
                  </select>
                </label>
                <label>
                  Unidade
                  <input value={form.unit} onChange={(e) => set('unit', e.target.value.toUpperCase())} />
                </label>
              </div>
              <label>
                Código interno (SKU)
                <input value={form.sku} onChange={(e) => set('sku', e.target.value)} />
              </label>
            </div>
          )}
          <div className="actions">
            <button className="btn primary">Salvar</button>
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {items.length > 5 && <input type="search" placeholder="Filtrar produtos" value={filter} onChange={(e) => setFilter(e.target.value)} />}

      {items.length === 0 && !editing && !importing && (
        <div className="card empty-state">
          <p>Nenhum produto cadastrado ainda.</p>
          <p className="muted small">Cadastre um a um ou importe de uma planilha.</p>
        </div>
      )}

      {Object.entries(groups).map(([cat, list]) => (
        <section key={cat} className="stack">
          <h2>{cat}</h2>
          <ul className="kb-list">
            {list.map((p) => (
              <li key={p.id} className={`card kb ${p.active ? '' : 'inactive'}`}>
                <div className="row">
                  <strong>{p.name}</strong>
                  <span className="price">{p.priceCents == null ? 'Sob orçamento' : formatBRL(p.priceCents)}</span>
                </div>
                <p className="muted small">
                  {[p.sizes.length && `Tam.: ${p.sizes.join(', ')}`, p.colors.length && `Cores: ${p.colors.join(', ')}`, p.minQuantity > 1 && `Mín. ${p.minQuantity}`, p.customizable && 'Personalizável']
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <div className="row">
                  <span className="small muted">{p.ncm ? `NCM ${p.ncm}` : <span className="pill warn">sem NCM</span>}</span>
                  <div className="actions">
                    <button className="btn small" onClick={() => api(`/products/${p.id}`, { method: 'PATCH', body: { active: !p.active } }).then(load)}>
                      {p.active ? 'Desativar' : 'Ativar'}
                    </button>
                    <button className="btn small" onClick={() => (setEditing(p.id), setForm(toForm(p)), window.scrollTo({ top: 0 }))}>
                      Editar
                    </button>
                    <button className="btn small danger" onClick={() => remove(p)}>
                      Excluir
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
