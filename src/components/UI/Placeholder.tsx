import { Component } from 'lucide-react';
import './Placeholder.css';

interface PlaceholderProps {
  title: string;
  hint?: string;
  height?: number | string;
}

export function PlaceholderChart({ title, hint, height = 220 }: PlaceholderProps) {
  return (
    <div
      className="placeholder-box"
      style={{ height, padding: 'var(--space-4)' }}
      aria-label={`Placeholder chart: ${title}`}
    >
      <Component size={20} aria-hidden />
      <strong>{title}</strong>
      {hint && <span>{hint}</span>}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <div>{title}</div>
      {hint && <div style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
