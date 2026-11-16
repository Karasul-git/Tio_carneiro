import { Link } from 'react-router-dom';
import { Icon, icons, type NavEntry } from '../App';

/** No celular, reúne as telas que não cabem na barra inferior. */
export default function MorePage({ entries }: { entries: NavEntry[] }) {
  return (
    <div className="page">
      <h1>Mais</h1>
      <ul className="more-list card">
        {entries.map((n) => (
          <li key={n.to}>
            <Link to={n.to}>
              <Icon d={icons[n.icon]} />
              <span>{n.label}</span>
              <span className="muted">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
