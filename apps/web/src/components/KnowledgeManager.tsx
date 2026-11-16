import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import type { KnowledgeItem } from '../lib/types';

type TestResult = {
  decision: 'auto' | 'suggest' | 'none';
  thresholds: { auto: number; suggest: number };
  matches: { id: string; question: string; answer: string; matchedText: string; confidence: number }[];
};

const empty = { question: '', variants: '', answer: '', category: '', active: true };
const pct = (n: number) => `${Math.round(n * 100)}%`;
const needsReview = (i: KnowledgeItem) => /\[AJUSTAR/i.test(i.answer);

export default function KnowledgeManager() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [test, setTest] = useState('');
  const [result, setResult] = useState<TestResult | null>(null);
  const [filter, setFilter] = useState('');

  const load = () => api<KnowledgeItem[]>('/knowledge').then(setItems);
  useEffect(() => {
    load();
  }, []);

  const startEdit = (i: KnowledgeItem | null) => {
    setError('');
    setEditing(i ? i.id : 'new');
    setForm(
      i
        ? { question: i.question, variants: i.variants.join('\n'), answer: i.answer, category: i.category ?? '', active: i.active }
        : empty,
    );
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const body = {
      question: form.question,
      variants: form.variants.split('\n').map((v) => v.trim()).filter(Boolean),
      answer: form.answer,
      category: form.category || null,
      active: form.active,
    };
    if (body.active && /\[AJUSTAR/i.test(body.answer)) {
      setError('A resposta ainda tem trechos [AJUSTAR: …]. Complete antes de ativar.');
      return;
    }
    try {
      if (editing === 'new') await api('/knowledge', { body });
      else await api(`/knowledge/${editing}`, { method: 'PATCH', body });
      setEditing(null);
      load();
      if (test) runTest();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const toggle = async (i: KnowledgeItem) => {
    if (!i.active && needsReview(i)) {
      startEdit(i);
      setError('Complete os trechos [AJUSTAR: …] da resposta antes de ativar.');
      return;
    }
    await api(`/knowledge/${i.id}`, { method: 'PATCH', body: { active: !i.active } });
    load();
  };

  const remove = async (i: KnowledgeItem) => {
    if (!confirm(`Excluir "${i.question}"?`)) return;
    await api(`/knowledge/${i.id}`, { method: 'DELETE' });
    load();
  };

  async function runTest(e?: FormEvent) {
    e?.preventDefault();
    if (!test.trim()) return;
    setResult(await api<TestResult>('/knowledge/test', { body: { text: test } }));
  }

  const shown = items.filter((i) =>
    `${i.question} ${i.variants.join(' ')} ${i.category ?? ''}`.toLowerCase().includes(filter.toLowerCase()),
  );
  const activeCount = items.filter((i) => i.active).length;

  return (
    <div className="stack">
      <form className="card stack" onSubmit={runTest}>
        <h2>Testar uma mensagem</h2>
        <p className="muted small">Escreva como um cliente escreveria e veja o que o robô faria.</p>
        <div className="composer-row">
          <input value={test} onChange={(e) => setTest(e.target.value)} placeholder="Ex.: vcs aceitam pix?" />
          <button className="btn primary">Testar</button>
        </div>
        {result && (
          <div className="stack">
            <p className={`decision ${result.decision}`}>
              {result.decision === 'auto' && '✅ O robô responderia sozinho'}
              {result.decision === 'suggest' && '🟡 O robô passaria ao atendente com esta sugestão'}
              {result.decision === 'none' && '⚪ Nenhuma resposta confiável — vai para o atendente'}
            </p>
            {result.matches.slice(0, 3).map((m) => (
              <div key={m.id} className="match">
                <div className="row">
                  <strong className="ellipsis">{m.question}</strong>
                  <span className="pill">{pct(m.confidence)}</span>
                </div>
                <div className="meter" aria-hidden="true">
                  <span style={{ width: pct(m.confidence) }} />
                  <i style={{ left: pct(result.thresholds.suggest) }} />
                  <i style={{ left: pct(result.thresholds.auto) }} />
                </div>
                <div className="muted small">Mais parecida com: “{m.matchedText}”</div>
              </div>
            ))}
          </div>
        )}
      </form>

      <div className="row">
        <h2>
          Respostas <span className="muted small">({activeCount} ativas de {items.length})</span>
        </h2>
        <button className="btn primary" onClick={() => startEdit(null)}>
          + Nova
        </button>
      </div>
      <input type="search" placeholder="Filtrar respostas" value={filter} onChange={(e) => setFilter(e.target.value)} />

      {editing && (
        <form className="card stack" onSubmit={save}>
          <h2>{editing === 'new' ? 'Nova resposta' : 'Editar resposta'}</h2>
          <label>
            Pergunta (como o cliente escreveria)
            <input value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} required minLength={3} />
          </label>
          <label>
            Outras formas de perguntar / palavras-chave (uma por linha)
            <textarea rows={4} value={form.variants} onChange={(e) => setForm({ ...form, variants: e.target.value })} />
          </label>
          <label>
            Resposta enviada ao cliente
            <textarea rows={4} value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} required />
          </label>
          <label>
            Categoria
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ex.: Prazos" />
          </label>
          <label className="check">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Ativa (o robô pode usar)
          </label>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button className="btn primary">Salvar</button>
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <ul className="kb-list">
        {shown.map((i) => (
          <li key={i.id} className={`card kb ${i.active ? '' : 'inactive'}`}>
            <div className="row">
              <strong>{i.question}</strong>
              <div className="row gap">
                {needsReview(i) && <span className="pill warn">Revisar</span>}
                {i.category && <span className="tag">{i.category}</span>}
              </div>
            </div>
            <p className="small">{i.answer}</p>
            {i.variants.length > 0 && <p className="muted small">Também: {i.variants.join(' · ')}</p>}
            <div className="row">
              <span className="muted small">Usada {i.hits}×</span>
              <div className="actions">
                <button className="btn small" onClick={() => toggle(i)}>
                  {i.active ? 'Desativar' : 'Ativar'}
                </button>
                <button className="btn small" onClick={() => startEdit(i)}>
                  Editar
                </button>
                <button className="btn small danger" onClick={() => remove(i)}>
                  Excluir
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
