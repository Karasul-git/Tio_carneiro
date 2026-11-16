import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { roleLabel } from '../lib/format';
import CompanySettings from '../components/CompanySettings';
import { disablePush, enablePush, isPushEnabled, pushSupported } from '../lib/push';

export default function SettingsPage() {
  const { user, logout, isManager } = useAuth();
  const [pushOn, setPushOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    isPushEnabled().then(setPushOn);
  }, []);

  const toggle = async () => {
    setBusy(true);
    setMsg('');
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
        setMsg('Notificações desativadas neste aparelho.');
      } else {
        await enablePush();
        setPushOn(true);
        setMsg('Pronto! Uma notificação de teste foi enviada.');
      }
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Ajustes</h1>
      </header>

      <section className="card">
        <h2>Minha conta</h2>
        <p>
          <strong>{user?.name}</strong>
          <br />
          <span className="muted">
            {user?.email} · {user && roleLabel[user.role]}
          </span>
        </p>
        <button className="btn" onClick={logout}>
          Sair
        </button>
      </section>

      <section className="card">
        <h2>Notificações neste aparelho</h2>
        <p className="muted">
          Receba um aviso quando um cliente mandar mensagem. Na próxima fase, o aviso vai trazer o resumo da triagem automática.
        </p>
        {!pushSupported() && (
          <p className="small muted">
            No iPhone: abra no Safari, toque em Compartilhar → <b>Adicionar à Tela de Início</b> e ative por aqui pelo app instalado.
          </p>
        )}
        <button className="btn primary" onClick={toggle} disabled={busy}>
          {pushOn ? 'Desativar notificações' : 'Ativar notificações'}
        </button>
        {msg && <p className="small">{msg}</p>}
      </section>
      {isManager && <CompanySettings />}
    </div>
  );
}
