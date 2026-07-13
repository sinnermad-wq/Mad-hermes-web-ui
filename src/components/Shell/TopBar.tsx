import { Activity, Search, Sun, Moon, Bell, Command } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import './TopBar.css';

interface TopBarProps {
  crumb?: string;
}

export function TopBar({ crumb }: TopBarProps) {
  const { theme, toggle } = useTheme();
  return (
    <header className="topbar" role="banner">
      <div className="topbar-left">
        <div className="topbar-brand">
          <Activity size={18} strokeWidth={2.2} aria-hidden />
          <span>Hermes</span>
        </div>
        {crumb && (
          <>
            <span className="text-tertiary" aria-hidden>
              /
            </span>
            <span className="topbar-crumb" title={crumb}>
              {crumb}
            </span>
          </>
        )}
      </div>

      <label className="topbar-search" aria-label="Search">
        <Search size={14} aria-hidden />
        <input placeholder="Search sessions, tools, docs…" />
        <span className="text-tertiary" style={{ display: 'inline-flex', gap: 4 }}>
          <Command size={12} aria-hidden />
          <Kbd>K</Kbd>
        </span>
      </label>

      <div className="topbar-right">
        <button className="icon-btn" aria-label="Notifications" type="button">
          <Bell size={16} aria-hidden />
        </button>
        <button
          className="icon-btn"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-pressed={theme === 'dark'}
          type="button"
          onClick={toggle}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
        </button>
      </div>
    </header>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        border: '1px solid var(--border-strong)',
        borderRadius: 3,
        padding: '0 4px',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {children}
    </span>
  );
}
