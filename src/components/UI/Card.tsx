import './Card.css';

interface KPIProps {
  title: string;
  value: string;
  delta?: string;
  tone?: 'ok' | 'warn' | 'err' | 'info' | 'pending';
  deltaLabel?: string;
}

export function KPI({ title, value, delta, tone, deltaLabel }: KPIProps) {
  return (
    <div className="card" role="group" aria-label={title}>
      <div className="card-title">{title}</div>
      <div className="card-value">{value}</div>
      {(delta || tone) && (
        <div className="card-foot">
          {tone && <span className={`badge ${tone} no-dot`}>{tone}</span>}
          {delta && <span>{deltaLabel ?? ''}{delta}</span>}
        </div>
      )}
    </div>
  );
}

interface SectionCardProps {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function SectionCard({ title, actions, children }: SectionCardProps) {
  return (
    <section className="section-card" aria-label={title}>
      <header className="section-card-header">
        <h2 className="section-card-title">{title}</h2>
        <div>{actions}</div>
      </header>
      <div className="section-card-body">{children}</div>
    </section>
  );
}
