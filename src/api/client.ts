/**
 * API surface for HERMES Web UI.
 *
 * Mode switch (see docs/CONFIG.md):
 *   VITE_API_BASE_URL unset/empty → mock data (v1 default)
 *   VITE_API_BASE_URL set         → real FastAPI server (v2a+)
 *
 * Mock functions are preserved so the bundle works standalone without a server.
 * Each function returns null on error so consuming components get a consistent
 * Loading → Data | Error → Empty state pipeline.
 *
 * v2a scope (real read APIs wired):
 *   GET /api/sessions            → listSessions()
 *   GET /api/sessions/:id/messages → getThread()
 *   GET /api/sessions/:id/context → getContext()
 *   GET /api/sessions/:id/trace   → getTrace()
 *   GET /api/dashboard/overview  → getOverview()
 *   GET /api/dashboard/health    → getHealth()
 *   GET /api/dashboard/review    → getReview()
 *   GET /api/dashboard/queue     → getQueue()
 *
 * NOT wired in v2a: SSE, postMessage, approveToolEvent, Mini App auth.
 */

import {
  sessionsMock,
  pinnedSessions,
  archivedSessions,
  recentSessions,
  chatThreadsBySession,
  emptyThread,
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
  chatThreadsBySession,
  emptyThread,
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

export type ApiMode = 'mock' | 'real' | 'mini-app';

export function getMode(): ApiMode {
  const base = String(import.meta.env.VITE_API_BASE_URL ?? '').trim();
  if (!base) return 'mock';
  if (String(import.meta.env.VITE_MINI_APP ?? '') === '1') return 'mini-app';
  return 'real';
}

export function getApiBaseUrl(): string {
  return String(import.meta.env.VITE_API_BASE_URL ?? '').trim();
}

/** SSE endpoint. v2a does not connect — reserved for v2b. */
export function getSseUrl(): string {
  const override = String(import.meta.env.VITE_SSE_URL ?? '').trim();
  if (override) return override;
  const base = getApiBaseUrl();
  return base ? `${base}/events` : '';
}

/* ------------------------ Internal fetch helper ------------------------ */

/**
 * Thin fetch wrapper that:
 * - Returns null on network/error (never throws to caller)
 * - Logs mismatches in dev mode
 * - Automatically parses JSON
 */
async function apiFetch<T>(path: string): Promise<T | null> {
  const base = getApiBaseUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}${path}`, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      console.warn(`[api] ${res.status} ${path}`);
      return null;
    }
    return res.json() as Promise<T>;
  } catch (err) {
    console.warn(`[api] fetch failed ${path}:`, err);
    return null;
  }
}

/* ------------------------ Sessions ------------------------ */

export interface ListSessionsOpts {
  filter?: 'all' | 'pinned' | 'archived' | 'recent';
  search?: string;
}

export async function listSessions(opts: ListSessionsOpts = {}): Promise<SessionItem[]> {
  if (getMode() === 'mock') {
    const filter = opts.filter ?? 'all';
    let items: SessionItem[];
    switch (filter) {
      case 'pinned': items = pinnedSessions; break;
      case 'archived': items = archivedSessions; break;
      case 'recent': items = recentSessions; break;
      default: items = sessionsMock;
    }
    if (opts.search) {
      const q = opts.search.toLowerCase();
      items = items.filter(
        (s) => s.title.toLowerCase().includes(q) || s.preview.toLowerCase().includes(q),
      );
    }
    return items;
  }

  // Real mode: map our filter to the API's filter param
  const apiFilter = opts.filter ?? 'all';
  const data = await apiFetch<{ sessions: SessionItem[] }>(
    `/api/sessions?filter=${apiFilter}&search=${encodeURIComponent(opts.search ?? '')}`,
  );
  return data?.sessions ?? null as unknown as SessionItem[];
}

export async function getSession(id: string): Promise<SessionItem | null> {
  if (getMode() === 'mock') {
    return sessionsMock.find((s) => s.id === id) ?? null;
  }
  const data = await apiFetch<SessionItem>(`/api/sessions/${encodeURIComponent(id)}`);
  return data;
}

/* ------------------------ Chat ------------------------ */

/** Shape returned by GET /api/sessions/:id/messages */
export interface ThreadResult {
  sessionId: string;
  messages: ChatMessage[];
  hasMore?: boolean;
  nextOffset?: number | null;
}

export async function getThread(sessionId: string): Promise<ThreadResult> {
  if (getMode() === 'mock') {
    const thread = chatThreadsBySession[sessionId] ?? emptyThread;
    return {
      sessionId: thread.sessionId || sessionId,
      messages: thread.messages.map((m) => ({ ...m })),
    };
  }

  const data = await apiFetch<ThreadResult>(
    `/api/sessions/${encodeURIComponent(sessionId)}/messages?limit=50`,
  );
  return data ?? { sessionId, messages: [] };
}

export async function postMessage(
  sessionId: string,
  content: string,
): Promise<ChatMessage> {
  // v2a: not wired — backend slot reserved, returns stub
  void sessionId;
  return {
    id: `m_${Date.now()}`,
    role: 'assistant',
    content: 'stub: send-message not wired in v2a. Reserved for v2b.',
    at: new Date().toISOString(),
    tokens: content.length,
    durationMs: 0,
  };
}

/* ------------------------ Trace + Context ------------------------ */

export async function getTrace(sessionId: string): Promise<TraceEntry[]> {
  if (getMode() === 'mock') {
    return traceMock;
  }
  const data = await apiFetch<{ sessionId: string; trace: TraceEntry[] }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/trace`,
  );
  return data?.trace ?? null as unknown as TraceEntry[];
}

export async function getContext(sessionId: string): Promise<ContextStats> {
  if (getMode() === 'mock') {
    return contextMock;
  }
  const data = await apiFetch<ContextStats>(
    `/api/sessions/${encodeURIComponent(sessionId)}/context`,
  );
  return data ?? contextMock; // fallback to mock so UI still renders
}

export async function approveToolEvent(
  sessionId: string,
  traceId: string,
  decision: 'approve' | 'deny',
): Promise<{ ok: boolean }> {
  // v2a: not wired — reserved slot
  console.info('[approval reserved]', { sessionId, traceId, decision });
  void sessionId; void traceId; void decision;
  return { ok: true };
}

/* ------------------------ Dashboard ------------------------ */

export async function getOverview(): Promise<DashboardKPI[]> {
  if (getMode() === 'mock') {
    return overviewKpis;
  }
  const data = await apiFetch<{ kpis: DashboardKPI[] }>('/api/dashboard/overview');
  return data?.kpis ?? null as unknown as DashboardKPI[];
}

export async function getHealth(): Promise<HealthRow[]> {
  if (getMode() === 'mock') {
    return healthRows;
  }
  const data = await apiFetch<{ rows: HealthRow[] }>('/api/dashboard/health');
  return data?.rows ?? null as unknown as HealthRow[];
}

export async function getReview(): Promise<ReviewRow[]> {
  if (getMode() === 'mock') {
    return reviewRows;
  }
  const data = await apiFetch<{ rows: ReviewRow[] }>('/api/dashboard/review');
  return data?.rows ?? null as unknown as ReviewRow[];
}

export async function getQueue(): Promise<QueueRow[]> {
  if (getMode() === 'mock') {
    return queueRows;
  }
  const data = await apiFetch<{ rows: QueueRow[] }>('/api/dashboard/queue');
  return data?.rows ?? null as unknown as QueueRow[];
}

export async function getDashboardBlocks(_area: 'overview' | 'health' | 'review' | 'queue'): Promise<DashboardBlockSpec[]> {
  // v2a: not wired — reserved slot
  return [];
}

export type DashboardBlockSpec =
  | { id: string; type: 'kpi'; title: string; source?: string; props: { label: string; value: string; delta?: string; status?: string } }
  | { id: string; type: 'chart'; title: string; source?: string; props: { component: string; height?: number; data?: unknown[] } }
  | { id: string; type: 'table'; title: string; source?: string; props: { columns: { key: string; label: string }[]; rows: unknown[] } }
  | { id: string; type: 'placeholder'; title: string; source?: string; props: { height?: number; hint?: string } };

/* ------------------------ SSE — reservation (not connected in v2a) ------------------------ */

export interface SSEEvent<T = unknown> {
  type: SSEEventType;
  payload: T;
  id?: string;
  ts: string;
}

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

/* ------------------------ Telegram Mini App — reservation (not wired in v2a) ------------------------ */

export interface MiniAppAuthBody {
  initData: string;
}

export interface MiniAppAuthResp {
  token: string;
  expiresAt: string;
  sessionId: string;
  user: {
    id: number;
    username?: string;
    firstName?: string;
  };
}

export const MINI_APP_JWT_STORAGE_KEY = 'hermes-web-ui.mini-app.jwt';