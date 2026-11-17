import { useState } from 'react';
import { api } from '../lib/api';
import type { Conversation } from '../lib/types';

const SNOOZE = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hora' },
  { minutes: 180, label: '3 horas' },
  { minutes: 1440, label: 'Amanhã' },
];

/** Ações para um cliente que aguarda resposta: tirar da fila ou adiar os lembretes. */
export default function WaitActions({ conv, onChange }: { conv: Conversation; onChange: (c: Conversation) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!conv.awaitingSince || conv.status !== 'OPEN') return null;
  const snoozed = conv.snoozedUntil && new Date(conv.snoozedUntil).getTime() > Date.now();

  const run = async (path: string, body: object = {}) => {
    setBusy(true);
    try {
      onChange(await api<Conversation>(`/conversations/${conv.id}/${path}`, { body }));
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wait-actions">
      <button className="btn small" disabled={busy} onClick={() => run('no-reply')} title="Ex.: o cliente só agradeceu">
        ✓ Não precisa responder
      </button>
      <div className="snooze">
        <button className="btn small" disabled={busy} onClick={() => setOpen(!open)} aria-expanded={open}>
          ⏰ {snoozed ? `Adiado até ${new Date(conv.snoozedUntil!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Adiar lembrete'}
        </button>
        {open && (
          <div className="snooze-menu" role="menu">
            {SNOOZE.map((s) => (
              <button key={s.minutes} role="menuitem" className="btn small" onClick={() => run('snooze', { minutes: s.minutes })}>
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {conv.remindersSent > 0 && <span className="muted small">🔔 lembrado {conv.remindersSent}×</span>}
    </div>
  );
}
