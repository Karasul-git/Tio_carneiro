import { useEffect, useMemo, useState } from 'react';
import { api, getToken } from '../lib/api';
import { formatBRL } from '../lib/format';
import type { Connection } from '../lib/types';
import BarChart from '../components/BarChart';

type Duration = { count: number; medianMinutes: number | null; averageMinutes: number | null; p90Minutes: number | null; withinPct: number | null };
type Overview = {
  service: {
    conversations: number;
    messagesIn: number;
    messagesOut: number;
    botMessages: number;
    handoffs: number;
    botResolved: number;
    waitingNow: number;
    responseTime: Duration;
    intents: { intent: string; label: string; count: number }[];
  };
  orders: {
    linksSent: number;
    submitted: number;
    confirmed: number;
    revenueCents: number;
    averageTicketCents: number;
    pieces: number;
    openNow: number;
    topProducts: { name: string; quantity: number; revenueCents: number }[];
  };
  byConnection: {
    id: string;
    name: string;
    attendant: string | null;
    conversations: number;
    messagesOut: number;
    responseTime: Duration;
    ordersConfirmed: number;
    revenueCents: number;
  }[];
  daily: { day: string; conversations: number; orders: number; revenueCents: number }[];
};

/** Data local de hoje (AAAA-MM-DD) */
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function preset(id: string): [string, string] {
  const now = new Date();
  const today = iso(now);
  const daysAgo = (n: number) => iso(new Date(now.getTime() - n * 86400000));
  switch (id) {
    case 'today':
      return [today, today];
    case '7d':
      return [daysAgo(6), today];
    case '30d':
      return [daysAgo(29), today];
    case 'month':
      return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), today];
    case 'lastMonth':
      return [iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), iso(new Date(now.getFullYear(), now.getMonth(), 0))];
    default:
      return [daysAgo(6), today];
  }
}

const PRESETS = [
  { id: 'today', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: 'month', label: 'Este mês' },
  { id: 'lastMonth', label: 'Mês passado' },
];

const minutesLabel = (m: number | null) => {
  if (m == null) return '—';
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  return `${h}h${String(Math.round(m % 60)).padStart(2, '0')}`;
};
const dayLabel = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const brlShort = (cents: number) =>
  cents >= 100000_00 ? `R$ ${(cents / 100000).toFixed(0)} mil` : formatBRL(cents).replace(/,00$/, '');

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat card">
      <span className="muted small">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="muted small">{hint}</span>}
    </div>
  );
}

function RankBars({ rows, format }: { rows: { label: string; value: number; extra?: string }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="rank">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="row">
            <span className="ellipsis">{r.label}</span>
            <span className="small">
              <b>{format(r.value)}</b>
              {r.extra && <span className="muted"> · {r.extra}</span>}
            </span>
          </div>
          <div className="rank-track" aria-hidden="true">
            <span style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function ReportsPage() {
  const [range, setRange] = useState<[string, string]>(preset('7d'));
  const [presetId, setPresetId] = useState('7d');
  const [connectionId, setConnectionId] = useState('');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const qs = useMemo(() => {
    const q = new URLSearchParams({ from: range[0], to: range[1] });
    if (connectionId) q.set('connectionId', connectionId);
    return q.toString();
  }, [range, connectionId]);

  useEffect(() => {
    api<Connection[]>('/connections').then(setConnections).catch(() => {});
  }, []);

  useEffect(() => {
    setError('');
    api<Overview>(`/reports/overview?${qs}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [qs]);

  const pick = (id: string) => {
    setPresetId(id);
    setRange(preset(id));
  };

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/reports/export?${qs}`, { headers: { authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error('Não foi possível gerar a planilha');
      const blob = await res.blob();
      const name = `relatorio_${range[0]}_a_${range[1]}.xlsx`;
      const file = new File([blob], name, { type: blob.type });
      // No celular, abre o menu de compartilhar (WhatsApp, e-mail, Drive…)
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Relatório' }).catch(() => {});
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const s = data?.service;
  const o = data?.orders;

  return (
    <div className="page">
      <header className="page-header">
        <div className="row">
          <h1>Relatórios</h1>
          <button className="btn primary" onClick={exportXlsx} disabled={exporting}>
            {exporting ? 'Gerando…' : '⬇ Excel'}
          </button>
        </div>
        <div className="filters">
          <div className="chips" role="radiogroup" aria-label="Período">
            {PRESETS.map((p) => (
              <button key={p.id} role="radio" aria-checked={presetId === p.id} className={`chip ${presetId === p.id ? 'on' : ''}`} onClick={() => pick(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="row gap">
            <input type="date" value={range[0]} max={range[1]} onChange={(e) => (setPresetId(''), setRange([e.target.value, range[1]]))} aria-label="De" />
            <input type="date" value={range[1]} min={range[0]} onChange={(e) => (setPresetId(''), setRange([range[0], e.target.value]))} aria-label="Até" />
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
          </div>
        </div>
        {error && <p className="error">{error}</p>}
      </header>

      {!data || !s || !o ? (
        <p className="muted">Carregando…</p>
      ) : (
        <>
          <section className="stack">
            <h2>Atendimento</h2>
            <div className="stats">
              <Stat label="Conversas" value={String(s.conversations)} hint={`${s.messagesIn} mensagens recebidas`} />
              <Stat label="Tempo de resposta" value={minutesLabel(s.responseTime.medianMinutes)} hint={`mediana · média ${minutesLabel(s.responseTime.averageMinutes)}`} />
              <Stat label="Respondidas em 15 min" value={s.responseTime.withinPct == null ? '—' : `${s.responseTime.withinPct}%`} hint={`${s.responseTime.count} respostas`} />
              <Stat label="Esperando agora" value={String(s.waitingNow)} />
              <Stat label="Resolvidas pelo robô" value={String(s.botResolved)} hint={`${s.handoffs} passadas ao atendente`} />
            </div>
            <BarChart title="Conversas por dia" data={data.daily.map((d) => ({ key: d.day, label: dayLabel(d.day), value: d.conversations }))} />
          </section>

          <section className="stack">
            <h2>Vendas</h2>
            <div className="stats">
              <Stat label="Faturamento" value={formatBRL(o.revenueCents)} hint="pedidos confirmados no período" />
              <Stat label="Pedidos confirmados" value={String(o.confirmed)} hint={`${o.pieces} peças`} />
              <Stat label="Ticket médio" value={o.confirmed ? formatBRL(o.averageTicketCents) : '—'} />
              <Stat label="Links → pedidos" value={`${o.linksSent} → ${o.submitted}`} hint="links criados → enviados pelo cliente" />
              <Stat label="Pedidos em andamento" value={String(o.openNow)} />
            </div>
            <BarChart title="Faturamento por dia" format={brlShort} data={data.daily.map((d) => ({ key: d.day, label: dayLabel(d.day), value: d.revenueCents }))} />
          </section>

          <div className="two-cols align-start">
            <section className="card stack">
              <h2>Produtos mais vendidos</h2>
              {o.topProducts.length === 0 ? (
                <p className="muted small">Nenhum pedido confirmado no período.</p>
              ) : (
                <RankBars rows={o.topProducts.map((p) => ({ label: p.name, value: p.quantity, extra: formatBRL(p.revenueCents) }))} format={(n) => `${n} pç`} />
              )}
            </section>
            <section className="card stack">
              <h2>Assuntos dos atendimentos</h2>
              {s.intents.length === 0 ? (
                <p className="muted small">Sem triagem do robô no período.</p>
              ) : (
                <RankBars rows={s.intents.map((i) => ({ label: i.label, value: i.count }))} format={(n) => String(n)} />
              )}
            </section>
          </div>

          <section className="card stack">
            <h2>Por número / atendente</h2>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Número</th>
                    <th className="num">Conversas</th>
                    <th className="num">Tempo de resposta</th>
                    <th className="num">Em 15 min</th>
                    <th className="num">Pedidos</th>
                    <th className="num">Faturamento</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byConnection.map((c) => (
                    <tr key={c.id}>
                      <td>
                        {c.name}
                        {c.attendant && <div className="muted small">{c.attendant}</div>}
                      </td>
                      <td className="num">{c.conversations}</td>
                      <td className="num">{minutesLabel(c.responseTime.medianMinutes)}</td>
                      <td className="num">{c.responseTime.withinPct == null ? '—' : `${c.responseTime.withinPct}%`}</td>
                      <td className="num">{c.ordersConfirmed}</td>
                      <td className="num">{formatBRL(c.revenueCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small">
              Tempo de resposta: da primeira mensagem do cliente até a resposta de uma pessoa (celular ou app). Mensagens do robô não contam.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
