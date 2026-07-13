import './Badge.css';

export type BadgeTone = 'ok' | 'warn' | 'err' | 'info' | 'pending';

interface StatusBadgeProps {
  tone: BadgeTone;
  label: string;
  withDot?: boolean;
}

export function StatusBadge({ tone, label, withDot = true }: StatusBadgeProps) {
  return (
    <span
      className={`badge ${tone}${withDot ? '' : ' no-dot'}`}
      role="status"
      aria-label={`${tone}: ${label}`}
    >
      {label}
    </span>
  );
}
