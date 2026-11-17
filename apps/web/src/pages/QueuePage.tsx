import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { centsToInput, parseBRL } from '../lib/format';
import type { QueueSettings } from '../lib/types';

function Num({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="inline">
      <span>{label}</span>
      <span className="num-input">
        <input type="number" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        {suffix && <span className="muted small">{suffix}</span>}
      </span>
    </label>
  );
}

const WEIGHTS = [
  { v: 0, label: 'Não conta' },
  { v: 0.5, label: 'Pouco' },
  { v: 1, label: 'Médio' },
  { v: 2, label: 'Muito' },
];

function Weight({ label, hint, value, onChange }: { label: string; hint: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="weight">
      <div>
        <strong>{label}</strong>
        <div className="muted small">{hint}</div>
      </div>
      <div className="chips" role="radiogroup" aria-label={label}>
        {WEIGHTS.map((w) => (
          <button key={w.v} type="button" role="radio" aria-checked={value === w.v} className={`chip ${value === w.v ? 'on' : ''}`} onClick={() => onChange(w.v)}>
            {w.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function QueuePage() {
  const [s, setS] = useState<QueueSettings | null>(null);
  const [msg, setMsg] = useState('');
  const [bigText, setBigText] = useState('');

  useEffect(() => {
    api<QueueSettings>('/queue/settings').then((d) => {
      setS(d);
      setBigText(centsToInput(d.priority.bigCustomerMinCents));
    });
  }, []);
  if (!s) return <div className="page muted">Carregando…</div>;

  const r = (patch: Partial<QueueSettings['reminders']>) => setS({ ...s, reminders: { ...s.reminders, ...patch } });
  const o = (patch: Partial<QueueSettings['orderReminders']>) => setS({ ...s, orderReminders: { ...s.orderReminders, ...patch } });
  const p = (patch: Partial<QueueSettings['priority']>) => setS({ ...s, priority: { ...s.priority, ...patch } });

  const save = async () => {
    setMsg('Salvando…');
    try {
      const body = { ...s, priority: { ...s.priority, bigCustomerMinCents: parseBRL(bigText) ?? 0 } };
      setS(await api<QueueSettings>('/queue/settings', { method: 'PUT', body }));
      setMsg('Salvo ✔');
    } catch (err) {
      setMsg((err as Error).message);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Fila e lembretes</h1>
        <p className="muted">Quem é atendido primeiro e quando avisar a equipe sobre clientes esquecidos.</p>
      </header>

      <section className="card stack">
        <h2>Lembretes de atendimento</h2>
        <label className="check">
          <input type="checkbox" checked={s.reminders.enabled} onChange={(e) => r({ enabled: e.target.checked })} />
          Avisar quando um cliente ficar sem resposta
        </label>
        <Num label="Primeiro aviso após" value={s.reminders.firstAfterMinutes} min={1} onChange={(v) => r({ firstAfterMinutes: v })} suffix="min" />
        <Num label="Repetir a cada" value={s.reminders.repeatEveryMinutes} min={5} onChange={(v) => r({ repeatEveryMinutes: v })} suffix="min" />
        <Num label="Máximo de avisos por cliente" value={s.reminders.maxReminders} min={1} max={20} onChange={(v) => r({ maxReminders: v })} />
        <Num
          label="Avisar também a gestão a partir do aviso nº (0 = nunca)"
          value={s.reminders.escalateToManagersAt}
          min={0}
          max={20}
          onChange={(v) => r({ escalateToManagersAt: v })}
        />
        <Num
          label="Cliente parado na triagem do robô conta após"
          value={s.reminders.triageStuckMinutes}
          min={5}
          onChange={(v) => r({ triageStuckMinutes: v })}
          suffix="min"
        />
        <label className="check">
          <input type="checkbox" checked={s.reminders.onlyBusinessHours} onChange={(e) => r({ onlyBusinessHours: e.target.checked })} />
          Só avisar dentro do horário de atendimento (configurado no Robô)
        </label>
        <p className="muted small">O aviso vai para o atendente do número; se o número não tiver atendente, vai para a gestão. Na conversa, dá para adiar ou marcar “não precisa responder”.</p>
      </section>

      <section className="card stack">
        <h2>Lembretes de pedidos</h2>
        <label className="check">
          <input type="checkbox" checked={s.orderReminders.enabled} onChange={(e) => o({ enabled: e.target.checked })} />
          Avisar sobre pedidos que precisam de atenção
        </label>
        <Num label="Pedido enviado e não confirmado após" value={s.orderReminders.submittedHours} min={0.5} step={0.5} onChange={(v) => o({ submittedHours: v })} suffix="horas" />
        <Num label="Avisar quando faltar até" value={s.orderReminders.dueSoonDays} min={0} max={30} onChange={(v) => o({ dueSoonDays: v })} suffix="dias para o prazo" />
      </section>

      <section className="card stack">
        <h2>Prioridade da fila</h2>
        <p className="muted small">
          Por padrão, quem espera há mais tempo vem primeiro. Dê peso a outros critérios para que certos clientes passem na frente.
        </p>
        <Weight label="⏱ Tempo de espera" hint="Quanto mais tempo esperando, mais alto na fila" value={s.priority.waitingWeight} onChange={(v) => p({ waitingWeight: v })} />
        <Num label="Tempo de espera atinge o máximo em" value={s.priority.waitingCapMinutes} min={10} onChange={(v) => p({ waitingCapMinutes: v })} suffix="min" />
        <Weight label="😠 Cliente insatisfeito" hint="Detectado por palavras como “absurdo”, “demora”, “!!!”" value={s.priority.unhappyWeight} onChange={(v) => p({ unhappyWeight: v })} />
        <Weight label="⚡ Cliente com pressa" hint="Detectado por “urgente”, “pra ontem”, “o quanto antes”" value={s.priority.urgentWeight} onChange={(v) => p({ urgentWeight: v })} />
        <Weight label="⭐ Cliente recorrente" hint="Já fez vários pedidos" value={s.priority.recurringWeight} onChange={(v) => p({ recurringWeight: v })} />
        {s.priority.recurringWeight > 0 && (
          <Num label="Recorrente a partir de" value={s.priority.recurringMinOrders} min={1} onChange={(v) => p({ recurringMinOrders: v })} suffix="pedidos" />
        )}
        <Weight label="💰 Cliente que compra muito" hint="Total comprado nos últimos 12 meses" value={s.priority.bigCustomerWeight} onChange={(v) => p({ bigCustomerWeight: v })} />
        {s.priority.bigCustomerWeight > 0 && (
          <label className="inline">
            <span>A partir de (R$, em 12 meses)</span>
            <input inputMode="decimal" value={bigText} onChange={(e) => setBigText(e.target.value)} />
          </label>
        )}
      </section>

      <div className="save-bar">
        <span className="small">{msg}</span>
        <button className="btn primary" onClick={save}>
          Salvar
        </button>
      </div>
    </div>
  );
}
