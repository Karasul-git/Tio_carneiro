import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { BotSettings, MenuOption } from '../lib/types';

type Response = { settings: BotSettings; aiAvailable: boolean; openNow: boolean };

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MESSAGE_FIELDS: { key: keyof BotSettings['messages']; label: string; hint?: string }[] = [
  { key: 'welcome', label: 'Boas-vindas', hint: '{nome} vira ", Maria" quando o nome do cliente é conhecido' },
  { key: 'menuIntro', label: 'Texto antes do menu' },
  { key: 'outOfHours', label: 'Aviso de fora do horário' },
  { key: 'handoff', label: 'Ao passar para o atendente' },
  { key: 'handoffOutOfHours', label: 'Ao passar para o atendente (fora do horário)' },
  { key: 'faqFollowUp', label: 'Depois de responder uma dúvida' },
  { key: 'notUnderstood', label: 'Quando não entende a opção' },
];

export default function BotSettingsForm() {
  const [data, setData] = useState<Response | null>(null);
  const [s, setS] = useState<BotSettings | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    api<Response>('/bot/settings').then((r) => {
      setData(r);
      setS(r.settings);
    });
  }, []);

  if (!s || !data) return <p className="muted">Carregando…</p>;

  const set = <K extends keyof BotSettings>(k: K, v: BotSettings[K]) => setS({ ...s, [k]: v });
  const setMenu = (i: number, patch: Partial<MenuOption>) =>
    set('menu', s.menu.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));

  const save = async () => {
    setStatus('Salvando…');
    try {
      const r = await api<Response>('/bot/settings', { method: 'PUT', body: s });
      setData(r);
      setS(r.settings);
      setStatus('Salvo ✔');
    } catch (err) {
      setStatus((err as Error).message);
    }
  };

  return (
    <div className="stack">
      <section className="card stack">
        <label className="check big">
          <input type="checkbox" checked={s.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          Robô ligado
        </label>
        <p className="muted small">
          Também dá para desligar o robô em um número específico, na tela Números. Agora estamos{' '}
          <b>{data.openNow ? 'dentro' : 'fora'}</b> do horário de atendimento.
        </p>
      </section>

      <section className="card stack">
        <h2>Horário de atendimento</h2>
        <p className="muted small">Intervalos no formato 08:00-18:00. Vários separados por vírgula (ex.: 08:00-12:00, 13:00-18:00). Vazio = fechado.</p>
        {DAYS.map((d, i) => (
          <label key={d} className="inline">
            <span>{d}</span>
            <input
              value={(s.businessHours.days[String(i)] ?? []).join(', ')}
              placeholder="Fechado"
              onChange={(e) =>
                set('businessHours', {
                  ...s.businessHours,
                  days: {
                    ...s.businessHours.days,
                    [String(i)]: e.target.value.split(',').map((x) => x.trim()).filter(Boolean),
                  },
                })
              }
            />
          </label>
        ))}
      </section>

      <section className="card stack">
        <h2>Menu</h2>
        {s.menu.map((o, i) => (
          <div key={i} className="menu-option stack">
            <div className="row gap">
              <input className="key" value={o.key} onChange={(e) => setMenu(i, { key: e.target.value })} aria-label="Número" />
              <input value={o.label} onChange={(e) => setMenu(i, { label: e.target.value })} aria-label="Texto da opção" />
            </div>
            <label>
              O que acontece
              <select value={o.action} onChange={(e) => setMenu(i, { action: e.target.value as MenuOption['action'] })}>
                <option value="collect">Pede detalhes e passa ao atendente</option>
                <option value="faq">Responde dúvidas pela base</option>
                <option value="handoff">Passa direto ao atendente</option>
                <option value="order">Envia o link de pedido (catálogo)</option>
              </select>
            </label>
            {o.action !== 'handoff' && (
              <label>
                {o.action === 'order' ? 'Mensagem com o link (use {link}; vazio = texto padrão da empresa)' : 'Mensagem ao escolher'}
                <textarea rows={2} value={o.prompt} onChange={(e) => setMenu(i, { prompt: e.target.value })} />
              </label>
            )}
            <label>
              Palavras que também escolhem esta opção (separadas por vírgula)
              <input
                value={o.keywords.join(', ')}
                onChange={(e) => setMenu(i, { keywords: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
              />
            </label>
            <label>
              Assunto (código interno)
              <input value={o.intent} onChange={(e) => setMenu(i, { intent: e.target.value })} />
            </label>
            <button className="btn small danger" onClick={() => set('menu', s.menu.filter((_, idx) => idx !== i))}>
              Remover opção
            </button>
          </div>
        ))}
        <button
          className="btn"
          onClick={() =>
            set('menu', [
              ...s.menu,
              { key: String(s.menu.length + 1), label: 'Nova opção', intent: 'outro', action: 'handoff', prompt: '', keywords: [] },
            ])
          }
        >
          + Adicionar opção
        </button>
      </section>

      <section className="card stack">
        <h2>Mensagens</h2>
        {MESSAGE_FIELDS.map((f) => (
          <label key={f.key}>
            {f.label}
            <textarea rows={2} value={s.messages[f.key]} onChange={(e) => set('messages', { ...s.messages, [f.key]: e.target.value })} />
            {f.hint && <span className="small muted">{f.hint}</span>}
          </label>
        ))}
      </section>

      <section className="card stack">
        <h2>Confiança das respostas</h2>
        <label>
          Responder sozinho a partir de {Math.round(s.autoAnswerThreshold * 100)}%
          <input type="range" min={0.5} max={0.98} step={0.01} value={s.autoAnswerThreshold} onChange={(e) => set('autoAnswerThreshold', Number(e.target.value))} />
        </label>
        <label>
          Sugerir ao atendente a partir de {Math.round(s.suggestThreshold * 100)}%
          <input type="range" min={0.2} max={0.9} step={0.01} value={s.suggestThreshold} onChange={(e) => set('suggestThreshold', Number(e.target.value))} />
        </label>
        <label className="check">
          <input type="checkbox" checked={s.answerFirstMessage} onChange={(e) => set('answerFirstMessage', e.target.checked)} />
          Responder dúvidas já na primeira mensagem (sem passar pelo menu)
        </label>
      </section>

      <section className="card stack">
        <h2>Limites e tempos</h2>
        <label className="inline">
          <span>Novo atendimento após (horas sem conversa)</span>
          <input type="number" min={0.5} max={168} step={0.5} value={s.sessionGapHours} onChange={(e) => set('sessionGapHours', Number(e.target.value))} />
        </label>
        <label className="inline">
          <span>Máximo de mensagens do robô por atendimento</span>
          <input type="number" min={1} max={30} value={s.maxBotMessagesPerSession} onChange={(e) => set('maxBotMessagesPerSession', Number(e.target.value))} />
        </label>
        <label className="inline">
          <span>Esperar o cliente terminar de digitar (segundos)</span>
          <input type="number" min={0} max={30} value={s.debounceSeconds} onChange={(e) => set('debounceSeconds', Number(e.target.value))} />
        </label>
      </section>

      <section className="card stack">
        <h2>Resumo com IA</h2>
        <label className="check">
          <input type="checkbox" checked={s.useAiSummary} onChange={(e) => set('useAiSummary', e.target.checked)} />
          Usar IA (Claude) para escrever o resumo
        </label>
        <p className="muted small">
          {data.aiAvailable
            ? 'Chave de IA configurada no servidor. O texto da conversa é enviado à Anthropic para gerar o resumo.'
            : 'Sem chave de IA no servidor (ANTHROPIC_API_KEY): o resumo é feito por regras, sem custo.'}
        </p>
      </section>

      <div className="save-bar">
        <span className="small">{status}</span>
        <button className="btn primary" onClick={save}>
          Salvar configurações
        </button>
      </div>
    </div>
  );
}
