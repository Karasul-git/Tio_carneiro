import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Company } from '../lib/types';

/** Dados da empresa e textos do link de pedido (gestão). */
export default function CompanySettings() {
  const [c, setC] = useState<Company | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    api<Company>('/company').then(setC);
  }, []);
  if (!c) return null;
  const set = <K extends keyof Company>(k: K, v: Company[K]) => setC({ ...c, [k]: v });
  const save = async () => {
    setMsg('');
    try {
      setC(await api<Company>('/company', { method: 'PUT', body: c }));
      setMsg('Salvo ✔');
    } catch (err) {
      setMsg((err as Error).message);
    }
  };
  return (
    <section className="card stack">
      <h2>Empresa e link de pedido</h2>
      <label>
        Nome exibido para o cliente
        <input value={c.name} onChange={(e) => set('name', e.target.value)} />
      </label>
      <label>
        CNPJ da empresa
        <input inputMode="numeric" value={c.document} onChange={(e) => set('document', e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={c.showPrices} onChange={(e) => set('showPrices', e.target.checked)} />
        Mostrar preços na página de pedido
      </label>
      <label>
        Endereço público do sistema
        <input value={c.publicUrl} onChange={(e) => set('publicUrl', e.target.value)} placeholder="https://atendimento.suaconfeccao.com.br" />
        <span className="small muted">Usado para montar o link enviado ao cliente. Vazio = configuração do servidor.</span>
      </label>
      <label>
        Texto no topo da página de pedido
        <textarea rows={2} value={c.orderPageIntro} onChange={(e) => set('orderPageIntro', e.target.value)} />
      </label>
      <label>
        Mensagem com o link de pedido ({'{link}'} vira o endereço)
        <textarea rows={4} value={c.orderLinkMessage} onChange={(e) => set('orderLinkMessage', e.target.value)} />
      </label>
      <label>
        Confirmação quando o cliente envia ({'{numero}'} vira o nº do pedido)
        <textarea rows={3} value={c.orderReceivedMessage} onChange={(e) => set('orderReceivedMessage', e.target.value)} />
      </label>
      <div className="row">
        <span className="small">{msg}</span>
        <button className="btn primary" onClick={save}>
          Salvar
        </button>
      </div>
    </section>
  );
}
