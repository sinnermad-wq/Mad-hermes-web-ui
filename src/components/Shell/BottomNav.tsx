import { NavLink } from 'react-router-dom';
import { MessageSquare, LayoutDashboard, History, Settings } from 'lucide-react';
import './BottomNav.css';

export function BottomNav() {
  const items = [
    { to: '/', label: 'Chat', icon: MessageSquare, end: true },
    { to: '/dashboard', label: 'Dash', icon: LayoutDashboard },
    { to: '/sessions', label: 'Sessions', icon: History },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];
  return (
    <nav className="bottomnav" aria-label="Primary mobile">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) => 'bottomnav-link' + (isActive ? ' active' : '')}
          >
            <Icon size={20} aria-hidden />
            <span>{it.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
