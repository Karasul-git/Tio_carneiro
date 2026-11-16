import { useState } from 'react';
import { api } from '../lib/api';
import { botStateLabel, isBotActive } from '../lib/format';
import type { Conversation } from '../lib/types';

/** Resumo da triagem para o atendente, sugestão da base e controle do robô. */
export default function SummaryPanel({
  conv,
  onChange,
  onUseSuggestion,
}: {
  conv: Conversation;
  onChange: (c: Conversation) => void;
  onUseSuggestion: (text: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const suggestion = conv.triage?.suggestion;
  const botActive = isBotActive(conv.botState);
  const hasContent = conv.summary || suggestion || botActive || conv.botState === 'HANDOFF';
  if (!hasContent) {
    return (
      <div className="summary compact">
        <button className="btn small" disabled={busy} onClick={() => refresh()}>
          Gerar resumo
        </button>
      </div>
    );
  }

  async function refresh() {
    setBusy(true);
    try {
      onChange(await api<Conversation>(`/conversations/${conv.id}/summary`, { body: {} }));
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function takeover() {
    setBusy(true);
    try {
      onChange(await api<Conversation>(`/conversations/${conv.id}/takeover`, { body: {} }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="summary" aria-label="Resumo do atendimento">
      <div className="row">
        <button className="summary-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? '▾' : '▸'} Resumo {conv.botState !== 'NONE' && <span className="muted small">· {botStateLabel[conv.botState]}</span>}
        </button>
        <div className="row gap">
          {botActive && (
            <button className="btn small primary" disabled={busy} onClick={takeover} title="O robô para de responder nesta conversa">
              Assumir
            </button>
          )}
          <button className="btn small" disabled={busy} onClick={refresh}>
            {busy ? '…' : 'Atualizar'}
          </button>
        </div>
      </div>
      {open && (
        <>
          {conv.summary ? (
            <p className="summary-text">{conv.summary}</p>
          ) : (
            <p className="muted small">{botActive ? 'O robô está conversando com o cliente.' : 'Sem resumo ainda.'}</p>
          )}
          {suggestion && (
            <div className="suggestion">
              <div className="small muted">
                Sugestão da base ({Math.round(suggestion.confidence * 100)}% de confiança): <b>{suggestion.question}</b>
              </div>
              <p>{suggestion.answer}</p>
              <button className="btn small" onClick={() => onUseSuggestion(suggestion.answer)}>
                Usar esta resposta
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
