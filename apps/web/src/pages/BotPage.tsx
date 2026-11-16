import { useState } from 'react';
import KnowledgeManager from '../components/KnowledgeManager';
import BotSettingsForm from '../components/BotSettingsForm';

export default function BotPage() {
  const [tab, setTab] = useState<'faq' | 'settings'>('faq');
  return (
    <div className="page">
      <header className="page-header">
        <h1>Robô de triagem</h1>
        <p className="muted">
          O robô cumprimenta, mostra o menu, responde dúvidas da base com confiança alta e passa ao atendente com um resumo.
        </p>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'faq'} className={`tab ${tab === 'faq' ? 'active' : ''}`} onClick={() => setTab('faq')}>
            Base de respostas
          </button>
          <button role="tab" aria-selected={tab === 'settings'} className={`tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
            Configurações
          </button>
        </div>
      </header>
      {tab === 'faq' ? <KnowledgeManager /> : <BotSettingsForm />}
    </div>
  );
}
