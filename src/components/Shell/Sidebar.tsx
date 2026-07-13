import { NavLink } from 'react-router-dom';
import { MessageSquare, LayoutDashboard, History, Settings, Cpu } from 'lucide-react';
import './Sidebar.css';

interface Item {
  to: string;
  label: string;
  icon: typeof MessageSquare;
  badge?: string;
}

const primary: Item[] = [
  { to: '/', label: 'Chat', icon: MessageSquare },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/sessions', label: 'Sessions', icon: History, badge: '3' },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  return (
    <nav className="sidebar" aria-label="Primary">
      <div className="sidebar-section" style={{ flex: 1, overflow: 'auto' }}>
        <div className="sidebar-label">Workspace</div>
        <div className="sidebar-nav">
          {primary.map((it) => {
            const Icon = it.icon;
            return (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.to === '/'}
                className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}
              >
                <Icon size={16} strokeWidth={2} aria-hidden />
                <span>{it.label}</span>
                {it.badge && <span className="sidebar-badge">{it.badge}</span>}
              </NavLink>
            );
          })}
        </div>
      </div>

      <div className="sidebar-footer">
        <span className="dot" aria-hidden />
        <Cpu size={12} aria-hidden />
        <span>main profile · ok</span>
      </div>
    </nav>
  );
}
