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
 * v2b scope: POST /api/sessions/:id/messages
 * v2c scope: GET /api/events SSE
 */

import { useEffect, useRef, useState } from 'react';

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
  // v2b: POST /api/sessions/:id/messages
  // Note: Hermes processes asynchronously; response message appears via
  // polling GET /messages or SSE (v2c). The returned ChatMessage here is
  // the *user* message just written, not the assistant reply.
  const BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!BASE) {
    // Fallback: echo stub (v1 mock)
    const msg: ChatMessage = {
      id: `m_${Date.now()}`,
      role: 'assistant',
      content: 'stub: set VITE_API_BASE_URL for real Hermes sessions.',
      at: new Date().toISOString(),
    };
    await new Promise((r) => setTimeout(r, 500));
    return msg;
  }
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const j = await res.json(); detail = j.detail || detail; } catch { /* ignore */ }
    // Surface database-locked 503 as a typed error the UI can recognise
    if (res.status === 503 && detail.toLowerCase().includes("locked")) {
      throw new Error("🔒 Database is busy — Hermes is mid-write. Try again in a moment.");
    }
    throw new Error(`postMessage failed: ${detail}`);
  }
  // Response is the created user message — return it so the caller can
  // append it to the thread optimistically.
  return res.json() as Promise<ChatMessage>;
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
  | 'trace.delta'     // v2c: new trace step detected
  | 'trace.done'      // v2c: trace step / turn completed
  | 'approval.requested'
  | 'approval.resolved'
  | 'queue.row'       // v2c: individual queue row update
  | 'queue.snapshot'  // v2c: full queue state on connect
  | 'queue.alert'     // v2c: queue threshold alert
  | 'queue.deleted'
  | 'health.changed';

/* ------------------------------------------------------------------ */
/* SSE Payload shapes                                                   */
/* ------------------------------------------------------------------ */

export interface TraceDeltaPayload {
  sessionId: string;
  step: TraceEntry;
}

export interface TraceDonePayload {
  sessionId: string;
  status: 'ok' | 'warn' | 'err';
  totalDurationMs: number;
  tokensUsed: number;
}

export interface QueueSnapshotPayload {
  rows: QueueRow[];
}

export interface QueueRowPayload {
  row: QueueRow;
}

export interface QueueAlertPayload {
  row: QueueRow;
  reason: string;
  severity: 'info' | 'warn' | 'err';
}

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

/* ------------------------------------------------------------------ */
/* v2c: SSE — EventSource wrapper + hooks                              */
/* ------------------------------------------------------------------ */

/** Connection states for an EventSource. */
export type EsState = 'connecting' | 'open' | 'reconnecting' | 'closed';

/**
 * Open an EventSource to /api/events, reconnecting on close with
 * exponential back-off. Dispatches events to registered listeners.
 * Returns a cleanup function.
 *
 * In mock mode (no VITE_API_BASE_URL) this is a no-op.
 */
export function openEventSource(params?: {
  sessionId?: string;
  onTraceDelta?: (p: TraceDeltaPayload) => void;
  onTraceDone?: (p: TraceDonePayload) => void;
  onQueueSnapshot?: (p: QueueSnapshotPayload) => void;
  onQueueRow?: (p: QueueRowPayload) => void;
  onQueueAlert?: (p: QueueAlertPayload) => void;
  onStateChange?: (s: EsState) => void;
}): () => void {
  const url = getSseUrl();
  if (!url) return () => { /* mock mode — no-op */ };

  const { sessionId, onStateChange } = params ?? {};

  // Build URL with optional filters
  const urlWithParams = sessionId ? `${url}?session=${encodeURIComponent(sessionId)}` : url;

  let es: EventSource;
  let retryCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  function notifyState(s: EsState) {
    onStateChange?.(s);
  }

  function connect() {
    if (destroyed) return;
    notifyState('connecting');

    es = new EventSource(urlWithParams);

    es.addEventListener('open', () => {
      retryCount = 0;
      notifyState('open');
    });

    // trace.delta
    es.addEventListener('trace.delta', (e) => {
      params?.onTraceDelta?.(JSON.parse((e as MessageEvent).data));
    });

    // trace.done
    es.addEventListener('trace.done', (e) => {
      params?.onTraceDone?.(JSON.parse((e as MessageEvent).data));
    });

    // queue.snapshot
    es.addEventListener('queue.snapshot', (e) => {
      params?.onQueueSnapshot?.(JSON.parse((e as MessageEvent).data));
    });

    // queue.row
    es.addEventListener('queue.row', (e) => {
      params?.onQueueRow?.(JSON.parse((e as MessageEvent).data));
    });

    // queue.alert
    es.addEventListener('queue.alert', (e) => {
      params?.onQueueAlert?.(JSON.parse((e as MessageEvent).data));
    });

    es.addEventListener('error', () => {
      if (destroyed) return;
      es.close();
      if (retryCount < 5) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30_000);
        retryCount++;
        notifyState('reconnecting');
        retryTimer = setTimeout(connect, delay);
      } else {
        notifyState('closed');
      }
    });
  }

  connect();

  // Returns cleanup — call to disconnect and stop reconnecting
  return () => {
    destroyed = true;
    if (retryTimer != null) clearTimeout(retryTimer);
    es.close();
  };
}

/**
 * useLiveTrace — opens an SSE connection scoped to a session and
 * updates the local trace array on each trace.delta / trace.done event.
 * Falls back to a single REST poll on error / close.
 *
 * Usage:
 *   const trace = useLiveTrace(sessionId, setTrace);
 */
export function useLiveTrace(
  sessionId: string | null,
  setTrace: React.Dispatch<React.SetStateAction<TraceEntry[]>>,
): void {
  useEffect(() => {
    if (!sessionId) return;

    // Snapshot: fetch current trace on connect
    getTrace(sessionId).then((initial) => {
      setTrace(initial);
    });

    const cleanup = openEventSource({
      sessionId,
      onTraceDelta: ({ step }) => {
        setTrace((prev) => {
          // Dedupe by id — avoid duplicates if REST poll already added it
          if (prev.some((e) => e.id === step.id)) return prev;
          return [...prev, step];
        });
      },
      onTraceDone: () => {
        // Turn complete — refresh full trace to pick up all steps
        getTrace(sessionId).then((fresh) => setTrace(fresh));
      },
      onStateChange: (s) => {
        if (s === 'closed') {
          // Exhausted retries — fall back to polling via setTrace call above
          getTrace(sessionId).then((fresh) => setTrace(fresh));
        }
      },
    });

    return cleanup;
  }, [sessionId, setTrace]);
}

/**
 * useLiveQueue — opens an SSE connection and updates the queue rows
 * on each queue.snapshot / queue.row / queue.alert event.
 */
export function useLiveQueue(
  setRows: React.Dispatch<React.SetStateAction<QueueRow[]>>,
  addAlert?: (msg: string) => void,
): void {
  useEffect(() => {
    // Snapshot: fetch current queue on connect
    getQueue().then((rows) => setRows(rows));

    const cleanup = openEventSource({
      onQueueSnapshot: ({ rows }) => setRows(rows),
      onQueueRow: ({ row }) => {
        setRows((prev) => {
          const idx = prev.findIndex((r) => r.id === row.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = row;
            return next;
          }
          return [...prev, row];
        });
      },
      onQueueAlert: ({ row, reason, severity }) => {
        addAlert?.(`[${severity.toUpperCase()}] ${row.name}: ${reason}`);
        // Also update the row in state
        setRows((prev) => {
          const idx = prev.findIndex((r) => r.id === row.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = row;
            return next;
          }
          return prev;
        });
      },
    });

    return cleanup;
  }, [setRows, addAlert]);
}

/**
 * Whether VITE_API_BASE_URL is set — true only when the real backend is active.
 * Use this to guard SSE-only UI elements.
 */
export const LIVE_MODE = Boolean(import.meta.env.VITE_API_BASE_URL);

/**
 * useLiveTraceEx — same as useLiveTrace but also returns the SSE connection state.
 * Use this when you need to show a live/reconnecting/closed badge in the UI.
 *
 * Usage:
 *   const esState = useLiveTraceEx(sessionId, setTrace);
 */
export function useLiveTraceEx(
  sessionId: string | null,
  setTrace: React.Dispatch<React.SetStateAction<TraceEntry[]>>,
): EsState {
  const [esState, setEsState] = useState<EsState>('connecting');
  // Store setter in ref so callbacks can call it without needing it in deps
  const setEsStateRef = useRef<typeof setEsState | null>(null);
  setEsStateRef.current = setEsState;

  useEffect(() => {
    if (!sessionId) return;

    getTrace(sessionId).then((initial) => setTrace(initial));

    const cleanup = openEventSource({
      sessionId,
      onTraceDelta: ({ step }) => {
        setTrace((prev) => {
          if (prev.some((e) => e.id === step.id)) return prev;
          return [...prev, step];
        });
      },
      onTraceDone: () => {
        getTrace(sessionId).then((fresh) => setTrace(fresh));
      },
      onStateChange: (s) => {
        (setEsStateRef.current as typeof setEsState)(s);
      },
    });

    return () => {
      setEsState('closed');
      cleanup();
    };
  }, [sessionId, setTrace]);

  return esState;
}

/**
 * useLiveQueueEx — same as useLiveQueue but also returns the SSE connection state.
 *
 * Usage:
 *   const esState = useLiveQueueEx(setRows, addAlert);
 *   // esState: 'connecting' | 'open' | 'reconnecting' | 'closed'
 */
export function useLiveQueueEx(
  setRows: React.Dispatch<React.SetStateAction<QueueRow[]>>,
  addAlert?: (msg: string) => void,
): EsState {
  const [esState, setEsState] = useState<EsState>('connecting');
  const setEsStateRef = useRef<typeof setEsState | null>(null);
  setEsStateRef.current = setEsState;

  useEffect(() => {
    getQueue().then((rows) => setRows(rows));

    const cleanup = openEventSource({
      onQueueSnapshot: ({ rows }) => setRows(rows),
      onQueueRow: ({ row }) => {
        setRows((prev) => {
          const idx = prev.findIndex((r) => r.id === row.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = row;
            return next;
          }
          return [...prev, row];
        });
      },
      onQueueAlert: ({ row, reason, severity }) => {
        addAlert?.(`[${severity.toUpperCase()}] ${row.name}: ${reason}`);
        setRows((prev) => {
          const idx = prev.findIndex((r) => r.id === row.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = row;
            return next;
          }
          return prev;
        });
      },
      onStateChange: (s) => {
        (setEsStateRef.current as typeof setEsState)(s);
      },
    });

    return () => {
      setEsState('closed');
      cleanup();
    };
  }, [setRows, addAlert]);

  return esState;
}

/**
 * useQueue2 — convenience wrapper for the Dashboard's useQueue pattern.
 * Returns { rows, esState } so callers can render both data and SSE status.
 *
 * Usage:
 *   const { rows, esState } = useQueue2(addAlert);
 */
export function useQueue2(addAlert?: (msg: string) => void) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const esState = useLiveQueueEx(setRows, addAlert);
  return { rows, esState };
}