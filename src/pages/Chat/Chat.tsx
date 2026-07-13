import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, History } from 'lucide-react';
import { StatusBadge } from '../../components/UI/Badge';
import { Tabs } from '../../components/UI/Tabs';
import { DataTable } from '../../components/UI/DataTable';
import type { Column } from '../../components/UI/DataTable';
import { EmptyState } from '../../components/UI/Placeholder';
import {
  getThread,
  getTrace,
  getContext,
  postMessage,
  listSessions,
  approveToolEvent,
  type SessionItem,
  type ChatMessage,
  type TraceEntry,
} from '../../api/client';
import './Chat.css';

type DetailTab = 'trace' | 'context' | 'approval';

function fmtRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const sessionCols: string[] = ['ok', 'ok', 'ok', 'runtime', 'ok', 'runtime'];

export function ChatPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tab, setTab] = useState<DetailTab>('trace');
  const [trace, setTrace] = useState<TraceEntry[]>([]);
  const [contextInfo, setContextInfo] = useState<Awaited<ReturnType<typeof getContext>> | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const convoRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listSessions({ filter: 'recent' }).then((items) => {
      setSessions(items);
      if (items.length && !activeId) setActiveId(items[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeId) return;
    setMessages([]);
    setTrace([]);
    setContextInfo(null);
    getThread(activeId).then((t) => setMessages(t.messages));
    getTrace(activeId).then(setTrace);
    getContext(activeId).then(setContextInfo);
  }, [activeId]);

  useEffect(() => {
    if (convoRef.current) convoRef.current.scrollTop = convoRef.current.scrollHeight;
  }, [messages]);

  const submit = async () => {
    if (!input.trim() || !activeId) return;
    setSending(true);
    const text = input.trim();
    setInput('');
    const userMsg: ChatMessage = {
      id: `local_${Date.now()}`,
      role: 'user',
      content: text,
      at: new Date().toISOString(),
      tokens: text.split(/\s+/).length,
    };
    setMessages((m) => [...m, userMsg]);
    const reply = await postMessage(activeId, text);
    setMessages((m) => [...m, reply]);
    setSending(false);
  };

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId],
  );

  const traceCols: Column<TraceEntry>[] = useMemo(
    () => [
      { key: 'time', header: 'Time', render: (r) => fmtClock(r.startedAt) },
      { key: 'label', header: 'Step', render: (r) => <code className="text-mono">{r.label}</code> },
      {
        key: 'tool',
        header: 'Tool',
        render: (r) =>
          r.tool ? <code className="text-mono text-secondary">{r.tool}</code> : <span className="text-tertiary">—</span>,
      },
      { key: 'dur', header: 'Dur', numeric: true, render: (r) => `${r.durationMs}ms` },
      {
        key: 'tok',
        header: 'Tokens',
        numeric: true,
        render: (r) => (r.tokens ? r.tokens.toLocaleString() : '—'),
      },
      {
        key: 'st',
        header: 'Status',
        render: (r) => <StatusBadge tone={r.status === 'ok' ? 'ok' : r.status === 'warn' ? 'warn' : r.status === 'err' ? 'err' : 'pending'} label={r.status} />,
      },
    ],
    [],
  );

  return (
    <div className="chat-page">
      {/* Session list */}
      <div className="session-list-header">
        <strong style={{ fontSize: 'var(--text-md)' }}>Sessions</strong>
        <History size={14} className="text-tertiary" aria-hidden />
      </div>
      <div className="session-list" role="list" aria-label="Session list">
        {sessions.length === 0 ? (
          <EmptyState title="No sessions yet" hint="Start a new chat from Telegram or CLI." />
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              role="listitem"
              className={'session-row' + (s.id === activeId ? ' active' : '')}
              onClick={() => setActiveId(s.id)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveId(s.id);
                }
              }}
            >
              <div className="row-top">
                <span className="title">{s.title}</span>
                {s.unread ? (
                  <span className="badge info no-dot" style={{ fontSize: 10, padding: '0 6px' }}>
                    {s.unread}
                  </span>
                ) : null}
              </div>
              <div className="meta">
                <StatusBadge
                  tone={s.status === 'active' ? 'ok' : s.status === 'error' ? 'err' : 'pending'}
                  label={s.source}
                />
                <span>{fmtRelative(s.lastActiveAt)} ago</span>
                <span>·</span>
                <span>{s.messageCount} msgs</span>
              </div>
              <div className="preview">{s.preview}</div>
            </div>
          ))
        )}
      </div>

      {/* Conversation */}
      <div className="convo">
        <div className="convo-body" ref={convoRef} role="log" aria-label="Conversation">
          {messages.map((m) => (
            <div key={m.id} className={'msg ' + m.role}>
              <div className="bubble">{m.content}</div>
              <div className="meta">
                <span>{m.role}</span>
                <span>·</span>
                <span>{fmtClock(m.at)}</span>
                {m.durationMs != null && (
                  <>
                    <span>·</span>
                    <span>{m.durationMs}ms</span>
                  </>
                )}
                {m.tokens != null && (
                  <>
                    <span>·</span>
                    <span>{m.tokens} tok</span>
                  </>
                )}
              </div>
            </div>
          ))}
          {messages.length === 0 && (
            <EmptyState title="No messages in this session yet." />
          )}
        </div>
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <textarea
            placeholder="Message Hermes…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            aria-label="Message input"
          />
          <button className="send" type="submit" disabled={!input.trim() || sending}>
            <Send size={14} aria-hidden />
            Send
          </button>
        </form>
      </div>

      {/* Detail */}
      <div className="detail-header">
        <strong style={{ fontSize: 'var(--text-md)' }}>
          {activeSession ? activeSession.title : 'No session selected'}
        </strong>
        {activeSession && (
          <span className="text-tertiary" style={{ fontSize: 'var(--text-xs)' }}>
            {activeSession.id}
          </span>
        )}
      </div>
      <div className="detail-tabs">
        <Tabs<DetailTab>
          items={[
            { id: 'trace', label: 'Trace' },
            { id: 'context', label: 'Context' },
            { id: 'approval', label: 'Approval' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      <div className="detail-body" role="tabpanel" aria-label={`${tab} panel`}>
        {tab === 'trace' && (
          <DataTable rows={trace} columns={traceCols} emptyHint="No trace entries yet." />
        )}

        {tab === 'context' && contextInfo && (
          <div className="placeholder-detail" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
              <span className="text-secondary">Window used</span>
              <span className="text-mono">{contextInfo.windowUsedPct}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-surface-2)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${contextInfo.windowUsedPct}%`,
                  background: 'var(--accent)',
                  height: '100%',
                  transition: 'width var(--t-base)',
                }}
              />
            </div>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li className="text-secondary">Window total: <span className="text-mono">{contextInfo.windowTotal.toLocaleString()}</span> tok</li>
              <li className="text-secondary">Messages cached: <span className="text-mono">{contextInfo.messagesCached}</span></li>
              <li className="text-secondary">Skills loaded:
                <ul>
                  {contextInfo.skillsLoaded.map((s) => (
                    <li key={s}><code className="text-mono">{s}</code></li>
                  ))}
                </ul>
              </li>
              <li className="text-secondary">Memory hits: <span className="text-mono">{contextInfo.memoryHits}</span></li>
              <li className="text-secondary">Tools registered: <span className="text-mono">{contextInfo.toolsRegistered}</span></li>
            </ul>
          </div>
        )}

        {tab === 'approval' && (
          <div className="placeholder-detail">
            <h3>Pending approvals</h3>
            {trace.some((t) => t.status === 'pending') ? (
              <ul>
                {trace
                  .filter((t) => t.status === 'pending')
                  .map((t) => (
                    <li key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <code className="text-mono">{t.label}</code>
                        <div className="text-tertiary" style={{ fontSize: 'var(--text-xs)' }}>
                          {t.tool ?? 'agent step'} · {t.durationMs}ms
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="badge ok no-dot"
                          style={{ cursor: 'pointer' }}
                          onClick={() => activeId && approveToolEvent(activeId, t.id, 'approve').then(() => setTrace([...trace]))}
                        >
                          approve
                        </button>
                        <button
                          className="badge err no-dot"
                          style={{ cursor: 'pointer' }}
                          onClick={() => activeId && approveToolEvent(activeId, t.id, 'deny').then(() => setTrace([...trace]))}
                        >
                          deny
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            ) : (
              <EmptyState title="No pending approvals." />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// avoid unused-var warning under ts strict
void sessionCols;
