/**
 * API surface reservation.
 *
 * Every page/component reads data through hooks in this file. Today they
 * resolve local mocks synchronously; tomorrow each `fetch*` call can be
 * swapped for `fetch('/api/...')` once the FastAPI backend lands.
 *
 * Mode switch — see docs/CONFIG.md:
 *   - VITE_API_BASE_URL empty/missing  → MOCK mode (v1 default)
 *   - VITE_API_BASE_URL set            → REAL mode (v2; current code still mocks)
 *   - VITE_MINI_APP=1                  → Mini App auth header injection (v2; v1 no-op)
 *
 * Slots reserved for later:
 *   - GET /api/sessions                  (list, filter by pinned/archived)
 *   - GET /api/sessions/:id              (single session summary)
 *   - GET /api/sessions/:id/messages     (conversation thread)
 *   - GET /api/sessions/:id/trace        (agent trace entries)
 *   - GET /api/sessions/:id/context      (cached context stats)
 *   - POST /api/sessions/:id/messages    (user message → assistant stub; rest via SSE)
 *   - POST /api/sessions/:id/approval/:traceId
 *   - GET /api/dashboard/{overview,health,review,queue}
 *   - GET /api/dashboard/blocks?area=…
 *   - SSE /api/events                    (see docs/SSE.md; payload envelope below)
 *   - POST /api/mini-app/auth            (Telegram initData → JWT — see docs/MINI_APP.md;
 *                                         v1 client never invokes; reservation only).
 *
 * All payload shapes are also re-exported from here so pages can `import type { … }`
 * without reaching into `mock/data.ts`.
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

/* ------------------------ Config / Mode ------------------------ */

/** Live runtime mode, derived from `import.meta.env`. */
export type ApiMode = 'mock' | 'real' | 'mini-app';

/** Returns 'mock' when VITE_API_BASE_URL is unset, 'real' otherwise. */
export function getMode(): ApiMode {
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').toString().trim();
  if (!base) return 'mock';
  if ((import.meta.env.VITE_MINI_APP ?? '').toString() === '1') return 'mini-app';
  return 'real';
}

/** Base URL read from env. Empty in v1 mock mode. v2 fetch wrappers key off this. */
export function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? '').toString().trim();
}

/** SSE endpoint read from env or derived from base. */
export function getSseUrl(): string {
  const override = (import.meta.env.VITE_SSE_URL ?? '').toString().trim();
  if (override) return override;
  const base = getApiBaseUrl();
  return base ? `${base}/events` : '';
}

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

export async function getDashboardBlocks(_area: 'overview' | 'health' | 'review' | 'queue'): Promise<DashboardBlockSpec[]> {
  // Future: GET /api/dashboard/blocks?area=…
  return [];
}

/** Tagged union — discriminated payload type for every SSE event name. */
export type DashboardBlockSpec =
  | { id: string; type: 'kpi'; title: string; source?: string; props: { label: string; value: string; delta?: string; status?: string } }
  | { id: string; type: 'chart'; title: string; source?: string; props: { component: string; height?: number; data?: unknown[] } }
  | { id: string; type: 'table'; title: string; source?: string; props: { columns: { key: string; label: string }[]; rows: unknown[] } }
  | { id: string; type: 'placeholder'; title: string; source?: string; props: { height?: number; hint?: string } };

/* ------------------------ SSE (server-sent events) — reservation ------------------------ */

/**
 * Server-sent event envelope. The server emits `event: <type>` and `data: <json>`
 * on the wire; the client wrapper packages into this shape.
 *
 * Full event vocabulary + per-event payloads: see docs/SSE.md.
 */
export interface SSEEvent<T = unknown> {
  type: SSEEventType;
  payload: T;
  id?: string;     // SSE last-event-id, for resume
  ts: string;      // ISO8601 server-emitted
}

/** Stable string enum of `event:` line names. */
export type SSEEventType =
  | 'session.started'
  | 'session.title'
  | 'session.archived'
  | 'session.context'
  | 'chat.message'
  | 'chat.messageEdit'
  | 'trace.step'
  | 'trace.completed'
  | 'approval.requested'
  | 'approval.resolved'
  | 'queue.row'
  | 'queue.deleted'
  | 'health.changed';

/* ------------------------ Telegram Mini App — reservation ------------------------ */

/** Body for POST /api/mini-app/auth. v1 client does NOT call this. */
export interface MiniAppAuthBody {
  initData: string;          // raw window.Telegram.WebApp.initData
}

/** Successful response from POST /api/mini-app/auth. v1 client does NOT call this. */
export interface MiniAppAuthResp {
  token: string;             // short-lived JWT (~15 min)
  expiresAt: string;         // ISO
  sessionId: string;         // server-bound, = sub of JWT
  user: {
    id: number;              // telegram user id
    username?: string;
    firstName?: string;
  };
}

/** sessionStorage key reserved for Mini App JWT. v1 does not write it. */
export const MINI_APP_JWT_STORAGE_KEY = 'hermes-web-ui.mini-app.jwt';
