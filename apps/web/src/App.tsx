import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import LoginPage from './pages/LoginPage';
import InboxPage from './pages/InboxPage';
import ConnectionsPage from './pages/ConnectionsPage';
import TeamPage from './pages/TeamPage';
import SettingsPage from './pages/SettingsPage';
import BotPage from './pages/BotPage';

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const icons = {
  chats: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  phone: 'M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2',
  bot: 'M12 8V4H8M4 12a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM9 13v1M15 13v1',
  team: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
};

export default function App() {
  const { user, loading, isManager } = useAuth();

  if (loading) return <div className="splash">Carregando…</div>;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <div className="shell">
      <nav className="nav" aria-label="Menu principal">
        <div className="nav-brand">Atendimentos</div>
        <NavLink to="/" end className="nav-item">
          <Icon d={icons.chats} />
          <span>Conversas</span>
        </NavLink>
        {isManager && (
          <NavLink to="/conexoes" className="nav-item">
            <Icon d={icons.phone} />
            <span>Números</span>
          </NavLink>
        )}
        {isManager && (
          <NavLink to="/robo" className="nav-item">
            <Icon d={icons.bot} />
            <span>Robô</span>
          </NavLink>
        )}
        {isManager && (
          <NavLink to="/equipe" className="nav-item">
            <Icon d={icons.team} />
            <span>Equipe</span>
          </NavLink>
        )}
        <NavLink to="/ajustes" className="nav-item">
          <Icon d={icons.gear} />
          <span>Ajustes</span>
        </NavLink>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<InboxPage />} />
          <Route path="/conversas/:id" element={<InboxPage />} />
          {isManager && <Route path="/conexoes" element={<ConnectionsPage />} />}
          {isManager && <Route path="/equipe" element={<TeamPage />} />}
          {isManager && <Route path="/robo" element={<BotPage />} />}
          <Route path="/ajustes" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
