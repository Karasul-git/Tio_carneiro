import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import LoginPage from './pages/LoginPage';
import InboxPage from './pages/InboxPage';
import ConnectionsPage from './pages/ConnectionsPage';
import TeamPage from './pages/TeamPage';
import SettingsPage from './pages/SettingsPage';
import BotPage from './pages/BotPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import ProductsPage from './pages/ProductsPage';
import { CustomerDetailPage, CustomersPage } from './pages/CustomersPage';
import PublicOrderPage from './pages/PublicOrderPage';
import MorePage from './pages/MorePage';
import QueuePage from './pages/QueuePage';

export function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export const icons = {
  chats: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  orders: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h8M9 9h3',
  products: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  customers: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  phone: 'M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2',
  bot: 'M12 8V4H8M4 12a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM9 13v1M15 13v1',
  team: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
};

export type NavEntry = { to: string; label: string; icon: keyof typeof icons; manager?: boolean; primary?: boolean };

/** Itens "primary" ficam na barra do celular; os demais vão para "Mais". */
export const NAV: NavEntry[] = [
  { to: '/', label: 'Conversas', icon: 'chats', primary: true },
  { to: '/pedidos', label: 'Pedidos', icon: 'orders', primary: true },
  { to: '/produtos', label: 'Produtos', icon: 'products', manager: true, primary: true },
  { to: '/clientes', label: 'Clientes', icon: 'customers' },
  { to: '/conexoes', label: 'Números', icon: 'phone', manager: true },
  { to: '/robo', label: 'Robô', icon: 'bot', manager: true },
  { to: '/fila', label: 'Fila e lembretes', icon: 'bell', manager: true },
  { to: '/equipe', label: 'Equipe', icon: 'team', manager: true },
  { to: '/ajustes', label: 'Ajustes', icon: 'gear' },
];

export default function App() {
  const { user, loading, isManager } = useAuth();
  const location = useLocation();

  // Página de pedido do cliente: pública, sem login
  if (location.pathname.startsWith('/p/')) {
    return (
      <Routes>
        <Route path="/p/:token" element={<PublicOrderPage />} />
      </Routes>
    );
  }

  if (loading) return <div className="splash">Carregando…</div>;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  const entries = NAV.filter((n) => !n.manager || isManager);
  const moreActive = entries.some((n) => !n.primary && location.pathname.startsWith(n.to) && n.to !== '/');

  return (
    <div className="shell">
      <nav className="nav" aria-label="Menu principal">
        <div className="nav-brand">Atendimentos</div>
        {entries.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={`nav-item ${n.primary ? '' : 'desktop-only'}`}>
            <Icon d={icons[n.icon]} />
            <span>{n.label}</span>
          </NavLink>
        ))}
        <NavLink to="/mais" className={`nav-item mobile-only ${moreActive ? 'active' : ''}`}>
          <Icon d={icons.more} />
          <span>Mais</span>
        </NavLink>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<InboxPage />} />
          <Route path="/conversas/:id" element={<InboxPage />} />
          <Route path="/pedidos" element={<OrdersPage />} />
          <Route path="/pedidos/:id" element={<OrderDetailPage />} />
          <Route path="/clientes" element={<CustomersPage />} />
          <Route path="/clientes/:id" element={<CustomerDetailPage />} />
          {isManager && <Route path="/produtos" element={<ProductsPage />} />}
          {isManager && <Route path="/conexoes" element={<ConnectionsPage />} />}
          {isManager && <Route path="/equipe" element={<TeamPage />} />}
          {isManager && <Route path="/robo" element={<BotPage />} />}
          {isManager && <Route path="/fila" element={<QueuePage />} />}
          <Route path="/ajustes" element={<SettingsPage />} />
          <Route path="/mais" element={<MorePage entries={entries.filter((n) => !n.primary)} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
