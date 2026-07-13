import { useEffect, useMemo, useState } from 'react';
import { Pin, Archive, RotateCw, Trash2 } from 'lucide-react';
import { Tabs, TabStrip } from '../../components/UI/Tabs';
import { StatusBadge, type BadgeTone } from '../../components/UI/Badge';
import { EmptyState } from '../../components/UI/Placeholder';
import { listSessions, type SessionItem } from '../../api/client';
import './Sessions.css';

type SessionsTab = 'recent' | 'pinned' | 'archived';

const tabs = [
  { id: 'recent' as const, label: 'Recent' },
  { id: 'pinned' as const, label: 'Pinned' },
  { id: 'archived' as const, label: 'Archived' },
];

function fmtRelative(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function sourceTone(s: SessionItem['source']): BadgeTone {
  if (s === 'cron') return 'info';
  if (s === 'cli') return 'pending';
  if (s === 'gateway' || s === 'telegram') return 'ok';
  return 'pending';
}

export function SessionsPage() {
  const [tab, setTab] = useState<SessionsTab>('recent');
  const [items, setItems] = useState<SessionItem[]>([]);

  useEffect(() => {
    listSessions({ filter: tab }).then(setItems);
  }, [tab]);

  const byFilter = useMemo(() => items, [items]);

  return (
    <div className="sessions-page">
      <TabStrip
        title="Sessions"
        sub={`filter:${tab} · ${byFilter.length} rows`}
        right={<Tabs<SessionsTab> items={tabs} value={tab} onChange={setTab} />}
      />
      <div className="sessions-grid">
        {byFilter.length === 0 ? (
          <EmptyState
            title={tab === 'pinned' ? 'No pinned sessions yet.' : tab === 'archived' ? 'Archive is empty.' : 'No recent sessions.'}
            hint="Pin from the chat list; archive when stale."
          />
        ) : (
          byFilter.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))
        )}
      </div>
    </div>
  );
}

function SessionCard({ session }: { session: SessionItem }) {
  return (
    <div className="session-card">
      <div className="title-row">
        <span className="title">{session.title}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <StatusBadge tone={sourceTone(session.source)} label={session.source} />
          {session.unread ? (
            <span className="badge info no-dot" style={{ fontSize: 10, padding: '0 6px' }}>
              {session.unread} new
            </span>
          ) : null}
        </div>
      </div>
      <div className="meta">
        <span>{session.id}</span>
        <span>·</span>
        <span>{session.messageCount} msgs</span>
        <span>·</span>
        <span>{fmtRelative(session.lastActiveAt)}</span>
      </div>
      <div className="preview">{session.preview}</div>
      <div className="card-foot">
        <StatusBadge
          tone={session.status === 'active' ? 'ok' : session.status === 'error' ? 'err' : 'pending'}
          label={session.status}
        />
        <div className="actions">
          <button className="icon-text-btn" type="button" title="Pin / unpin">
            <Pin size={12} aria-hidden /> {session.pinned ? 'Unpin' : 'Pin'}
          </button>
          {session.status !== 'archived' ? (
            <button className="icon-text-btn" type="button" title="Archive">
              <Archive size={12} aria-hidden /> Archive
            </button>
          ) : (
            <>
              <button className="icon-text-btn" type="button" title="Restore">
                <RotateCw size={12} aria-hidden /> Restore
              </button>
              <button className="icon-text-btn" type="button" title="Delete">
                <Trash2 size={12} aria-hidden /> Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
