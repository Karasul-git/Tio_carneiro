import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { roleLabel } from '../lib/format';
import type { Role, User } from '../lib/types';

export default function TeamPage() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === 'ADMIN';
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'ATENDENTE' as Role });
  const [error, setError] = useState('');

  const load = () => api<User[]>('/users').then(setUsers);
  useEffect(() => {
    load();
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api('/users', { body: form });
      setForm({ name: '', email: '', password: '', role: 'ATENDENTE' });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const update = async (id: string, data: Partial<User> & { password?: string }) => {
    setError('');
    try {
      await api(`/users/${id}`, { method: 'PATCH', body: data });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Equipe</h1>
        <p className="muted">Atendentes veem só as conversas dos números ligados a eles. Gestores veem tudo.</p>
      </header>
      {error && <p className="error">{error}</p>}

      <div className="card">
        <ul className="user-list">
          {users.map((u) => (
            <li key={u.id} className={u.active === false ? 'inactive' : ''}>
              <div>
                <strong>{u.name}</strong>
                <div className="muted small">{u.email}</div>
              </div>
              {isAdmin && u.id !== me?.id ? (
                <div className="row gap">
                  <select value={u.role} onChange={(e) => update(u.id, { role: e.target.value as Role })} aria-label="Perfil">
                    {Object.entries(roleLabel).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <button className="btn small" onClick={() => update(u.id, { active: u.active === false })}>
                    {u.active === false ? 'Reativar' : 'Desativar'}
                  </button>
                  <button
                    className="btn small"
                    onClick={() => {
                      const password = prompt(`Nova senha para ${u.name} (mínimo 6 caracteres):`);
                      if (password) update(u.id, { password });
                    }}
                  >
                    Senha
                  </button>
                </div>
              ) : (
                <span className="tag">{roleLabel[u.role]}</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {isAdmin && (
        <form className="card form" onSubmit={create}>
          <h2>Novo usuário</h2>
          <label>
            Nome
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label>
            E-mail
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>
          <label>
            Senha inicial
            <input type="password" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </label>
          <label>
            Perfil
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {Object.entries(roleLabel).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <button className="btn primary">Criar usuário</button>
        </form>
      )}
    </div>
  );
}
