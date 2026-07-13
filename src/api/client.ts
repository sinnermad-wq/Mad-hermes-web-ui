/**
 * API surface reservation.
 *
 * Every page/component reads data through hooks in this file. Today they
 * resolve local mocks synchronously; tomorrow each `fetch*` call can be
 * swapped for `fetch('/api/...')` once the FastAPI backend lands.
 *
 * Slots reserved for later:
 *   - GET /api/sessions                  (list, filter by pinned/archived)
 *   - GET /api/sessions/:id              (single session summary)
 *   - GET /api/sessions/:id/messages     (conversation thread)
 *   - GET /api/sessions/:id/trace        (agent trace entries)
 *   - GET /api/sessions/:id/context      (cached context stats)
 *   - GET /api/dashboard/overview        (KPIs)
 *   - GET /api/dashboard/health          (component health rows)
 *   - GET /api/dashboard/review          (prediction review history)
 *   - GET /api/dashboard/queue           (cron/webhook/spawn queue rows)
 *   - SSE /api/events                    (push updates — Trace panel, queue)
 *   - Telegram Mini App: served as a static sub-app at /mini-app/* by
 *     Vite via the same bundles, but POST /api/mini-app/auth to exchange
 *     initData for a session JWT (backend-side reservation).
 */

import {
  sessionsMock,
  pinnedSessions,
  archivedSessions,
  recentSessions,
  chatThreadMock,
  traceMock,
  contextMock,
  overviewKpis,
  healthRows,
  reviewRows,
  queueRows,
} from '../mock/data';

export {
  sessionsMock,
  pinnedSessions,
  archivedSessions,
  recentSessions,
  chatThreadMock,
  traceMock,
  contextMock,
  overviewKpis,
  healthRows,
  reviewRows,
  queueRows,
} from '../mock/data';

import type {
  SessionItem,
  ChatMessage,
  ChatThread,
  TraceEntry,
  ContextStats,
  DashboardKPI,
  HealthRow,
  ReviewRow,
  QueueRow,
  StatusMetaEntry,
} from '../mock/data';

export type {
  SessionItem,
  ChatMessage,
  ChatThread,
  TraceEntry,
  ContextStats,
  DashboardKPI,
  HealthRow,
  ReviewRow,
  QueueRow,
  StatusMetaEntry,
};

/* ------------------------ Sessions ------------------------ */

export interface ListSessionsOpts {
  filter?: 'all' | 'pinned' | 'archived' | 'recent';
  search?: string;
}

export async function listSessions(opts: ListSessionsOpts = {}): Promise<SessionItem[]> {
  // Future: GET /api/sessions?filter=...
  const filter = opts.filter ?? 'all';
  let items: SessionItem[];
  switch (filter) {
    case 'pinned':
      items = pinnedSessions;
      break;
    case 'archived':
      items = archivedSessions;
      break;
    case 'recent':
      items = recentSessions;
      break;
    default:
      items = sessionsMock;
  }
  if (opts.search) {
    const q = opts.search.toLowerCase();
    items = items.filter(
      (s) => s.title.toLowerCase().includes(q) || s.preview.toLowerCase().includes(q),
    );
  }
  return items;
}

export async function getSession(id: string): Promise<SessionItem | null> {
  // Future: GET /api/sessions/:id
  void id;
  return sessionsMock.find((s) => s.id === id) ?? null;
}

/* ------------------------ Chat ------------------------ */

export interface ThreadResult {
  sessionId: string;
  messages: ChatMessage[];
}

export async function getThread(sessionId: string): Promise<ThreadResult> {
  // Future: GET /api/sessions/:id/messages
  void sessionId;
  return {
    sessionId: chatThreadMock.sessionId,
    messages: [...chatThreadMock.messages],
  };
}

export async function postMessage(
  sessionId: string,
  content: string,
): Promise<ChatMessage> {
  // Future: POST /api/sessions/:id/messages
  //         then subscribe via SSE /api/events?session=:id
  void sessionId;
  return {
    id: `m_${Date.now()}`,
    role: 'assistant',
    content: 'stub: backend not wired. UI shell only.',
    at: new Date().toISOString(),
    tokens: content.length,
    durationMs: 0,
  };
}

export async function getTrace(_sessionId: string): Promise<TraceEntry[]> {
  // Future: GET /api/sessions/:id/trace (or SSE stream)
  return traceMock;
}

export async function getContext(_sessionId: string): Promise<ContextStats> {
  // Future: GET /api/sessions/:id/context
  return contextMock;
}

export async function approveToolEvent(
  sessionId: string,
  traceId: string,
  decision: 'approve' | 'deny',
): Promise<{ ok: boolean }> {
  // Future: POST /api/sessions/:id/approval/:traceId
  console.info('[approval reserved]', { sessionId, traceId, decision });
  return { ok: true };
}

/* ------------------------ Dashboard ------------------------ */

export async function getOverview(): Promise<DashboardKPI[]> {
  return overviewKpis;
}
export async function getHealth(): Promise<HealthRow[]> {
  return healthRows;
}
export async function getReview(): Promise<ReviewRow[]> {
  return reviewRows;
}
export async function getQueue(): Promise<QueueRow[]> {
  return queueRows;
}

/**
 * Server-side widget registration point for dashboard blocks.
 * The existing `daily-xauusd-bot` packages chart cards. We expose the same
 * shape so a single Telemetry API can return them in v2.
 */
export interface DashboardBlockSpec {
  id: string;
  type: 'kpi' | 'chart' | 'table' | 'placeholder';
  title: string;
  source?: string; // e.g., 'daily-xauusd-bot'
  props?: Record<string, unknown>;
}

export async function getDashboardBlocks(area: 'overview' | 'health' | 'review' | 'queue'): Promise<DashboardBlockSpec[]> {
  // Future: GET /api/dashboard/blocks?area=...
  void area;
  return [];
}
