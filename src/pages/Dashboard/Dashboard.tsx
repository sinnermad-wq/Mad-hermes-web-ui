import { useEffect, useMemo, useState } from 'react';
import { KPI } from '../../components/UI/Card';
import { Tabs, TabStrip } from '../../components/UI/Tabs';
import { StatusBadge } from '../../components/UI/Badge';
import { DataTable } from '../../components/UI/DataTable';
import type { Column } from '../../components/UI/DataTable';
import { PlaceholderChart } from '../../components/UI/Placeholder';
import {
  getOverview,
  getHealth,
  getReview,
  useQueue2,
  LIVE_MODE,
  type DashboardKPI,
  type HealthRow,
  type ReviewRow,
  type QueueRow,
} from '../../api/client';
import './Dashboard.css';

type AreaTab = 'overview' | 'health' | 'review' | 'queue';

const areaItems = [
  { id: 'overview' as const, label: 'Overview' },
  { id: 'health' as const, label: 'Health' },
  { id: 'review' as const, label: 'Review' },
  { id: 'queue' as const, label: 'Queue' },
];

function toneOfStatus(s: string): 'ok' | 'warn' | 'err' | 'info' | 'pending' {
  if (s === 'ok' || s === 'correct') return 'ok';
  if (s === 'warn' || s === 'partial') return 'warn';
  if (s === 'err' || s === 'wrong') return 'err';
  if (s === 'running' || s === 'scheduled' || s === 'info') return 'info';
  return 'pending';
}

export function DashboardPage() {
  const [area, setArea] = useState<AreaTab>('overview');

  return (
    <div className="dashboard">
      <TabStrip
        title="Dashboard"
        sub={`area:${area} · mock data`}
        right={
          <Tabs<AreaTab> items={areaItems} value={area} onChange={setArea} />
        }
      />
      {area === 'overview' && <Overview />}
      {area === 'health' && <Health />}
      {area === 'review' && <Review />}
      {area === 'queue' && <Queue />}
    </div>
  );
}

function useOverview() {
  const [kpis, setKpis] = useState<DashboardKPI[]>([]);
  useEffect(() => {
    getOverview().then(setKpis);
  }, []);
  return kpis;
}
function useHealth() {
  const [rows, setRows] = useState<HealthRow[]>([]);
  useEffect(() => {
    getHealth().then(setRows);
  }, []);
  return rows;
}
function useReview() {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  useEffect(() => {
    getReview().then(setRows);
  }, []);
  return rows;
}

function Overview() {
  const kpis = useOverview();
  return (
    <>
      <div className="kpi-grid">
        {kpis.map((k) => (
          <KPI
            key={k.label}
            title={k.label}
            value={k.value}
            delta={k.delta}
            deltaLabel=""
            tone={k.status ? toneOfStatus(k.status) : undefined}
          />
        ))}
      </div>
      <div className="tab-grid">
        <div className="dash-chart-row">
          <PlaceholderChart
            title="Daily tokens (14d)"
            hint="Drop in <DashboardChart/> from daily-xauusd-bot v2."
            height={220}
          />
          <PlaceholderChart
            title="Daily cost (14d)"
            hint="Backend hook: GET /api/dashboard/blocks"
            height={220}
          />
        </div>
        <div className="dash-chart-row">
          <PlaceholderChart
            title="Sessions per day"
            height={180}
          />
          <PlaceholderChart
            title="Cron success rate"
            height={180}
          />
        </div>
      </div>
    </>
  );
}

function Health() {
  const rows = useHealth();
  const cols: Column<HealthRow>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Component',
        render: (r) => (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span>{r.name}</span>
            <span className="text-tertiary" style={{ fontSize: 'var(--text-xs)' }}>{r.category}</span>
          </div>
        ),
      },
      { key: 'detail', header: 'Detail', render: (r) => <span className="text-secondary">{r.detail}</span> },
      {
        key: 'st',
        header: 'Status',
        render: (r) => <StatusBadge tone={toneOfStatus(r.status)} label={r.status} />,
      },
    ],
    [],
  );
  return (
    <div className="tab-grid">
      <div className="health-table">
        <DataTable rows={rows} columns={cols} />
      </div>
    </div>
  );
}

function Review() {
  const rows = useReview();
  const cols: Column<ReviewRow>[] = useMemo(
    () => [
      { key: 'date', header: 'Date', render: (r) => r.date },
      { key: 'topic', header: 'Topic', render: (r) => r.topic },
      {
        key: 'pred',
        header: 'Predicted',
        render: (r) => <StatusBadge tone={toneOfStatus(r.predicted)} label={r.predicted} />,
      },
      {
        key: 'out',
        header: 'Outcome',
        render: (r) => <StatusBadge tone={toneOfStatus(r.outcome)} label={r.outcome} />,
      },
      { key: 'note', header: 'Notes', render: (r) => <span className="text-secondary">{r.notes}</span> },
    ],
    [],
  );
  return (
    <div className="tab-grid">
      <div className="review-table">
        <DataTable rows={rows} columns={cols} />
      </div>
    </div>
  );
}

function Queue() {
  const [alerts, setAlerts] = useState<string[]>([]);
  const { rows, esState } = useQueue2((msg) => setAlerts((prev) => [msg, ...prev].slice(0, 5)));
  const cols: Column<QueueRow>[] = useMemo(
    () => [
      {
        key: 'kind',
        header: 'Kind',
        render: (r) => <StatusBadge tone="info" label={r.kind} />,
      },
      { key: 'name', header: 'Name', render: (r) => r.name },
      {
        key: 'st',
        header: 'Status',
        render: (r) => <StatusBadge tone={toneOfStatus(r.status)} label={r.status} />,
      },
      { key: 'next', header: 'Next', render: (r) => r.nextRun ?? '—' },
      { key: 'det', header: 'Detail', render: (r) => <span className="text-tertiary">{r.detail ?? ''}</span> },
    ],
    [],
  );
  return (
    <div className="tab-grid">
      {alerts.length > 0 && (
        <div className="queue-alerts" style={{ marginBottom: '8px' }}>
          {alerts.map((a, i) => (
            <div key={i} style={{ color: 'var(--color-warn)', fontSize: 'var(--text-sm)', padding: '4px 0' }}>
              ⚠ {a}
            </div>
          ))}
        </div>
      )}
      {/* SSE state notice */}
      {LIVE_MODE && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          {esState === 'connecting' && (
            <span className="badge info no-dot" style={{ fontSize: 'var(--text-xs)' }}>
              ↻ Connecting to queue...
            </span>
          )}
          {esState === 'open' && (
            <span className="badge ok no-dot" style={{ fontSize: 'var(--text-xs)' }}>
              ● Live
            </span>
          )}
          {esState === 'reconnecting' && (
            <span className="badge warn no-dot" style={{ fontSize: 'var(--text-xs)' }}>
              ↻ Reconnecting — using REST fallback
            </span>
          )}
          {esState === 'closed' && (
            <span className="badge no-dot" style={{ fontSize: 'var(--text-xs)', color: 'var(--status-info)', background: 'var(--status-info-bg)' }}>
              ✕ Live off — data via REST
            </span>
          )}
        </div>
      )}
      <div className="queue-table">
        <DataTable rows={rows} columns={cols} />
      </div>
    </div>
  );
}
