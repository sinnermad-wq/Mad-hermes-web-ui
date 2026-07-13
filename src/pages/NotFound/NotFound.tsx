import { Link, useLocation } from 'react-router-dom';
import { Compass } from 'lucide-react';

export function NotFoundPage() {
  const loc = useLocation();
  return (
    <main
      className="page"
      aria-label="404"
      style={{
        padding: 'var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-3)',
        textAlign: 'center',
      }}
    >
      <Compass size={28} aria-hidden style={{ color: 'var(--text-tertiary)' }} />
      <h1 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 600 }}>
        404 — path not in console
      </h1>
      <p style={{ margin: 0, color: 'var(--text-secondary)', maxWidth: 480 }}>
        The route <code className="text-mono">{loc.pathname}</code> isn't wired in v1. The four
        primary destinations live in the sidebar (desktop) or bottom nav (mobile).
      </p>
      <Link
        to="/"
        style={{
          marginTop: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-4)',
          background: 'var(--accent-bg)',
          color: 'var(--accent-text)',
          borderRadius: 'var(--radius-md)',
          fontWeight: 500,
          textDecoration: 'none',
        }}
      >
        Back to Chat
      </Link>
    </main>
  );
}
