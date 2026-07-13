# SSE event schema — HERMES Web UI

`src/api/client.ts` reserves `SSE /events` for live updates to the Chat Trace / Context panel and the Dashboard Queue panel. v1 client never opens a stream — these shapes are locked in now so v2 hooks drop in.

## Wire format

`text/event-stream` over HTTP. Each server-sent event has the standard SSE framing with `event:`, `data:`, and optional `id:` / `retry:` fields. Data payload **must** be valid JSON.

Envelope (client wrapper sees this — server emits `event` *name* per stream event, payload per `data` JSON):

```ts
// What the server sends on the wire:
event: session.update
data: {"sessionId":"…","traceId":"…","status":"ok", …payload}

// What the client gets after JSON.parse(data):
interface SSEEvent<T = unknown> {
  type: string;             // matches the `event:` line
  payload: T;               // parsed JSON from `data:`
  id?: string;              // SSE last-event-id (resumability)
  ts: string;               // ISO8601, set by server before send
}
```

Resumability: client captures `id`, sends `Last-Event-ID` header on reconnect; server may resume from cursor.

Heartbeat: server sends a comment line `: ping\n\n` every 15s. Client side ignores (comments don't trigger `onmessage`).

## Common types (cross-event)

```ts
type Tone = 'ok' | 'warn' | 'err' | 'pending' | 'info';

interface BaseUpdate {
  sessionId?: string;       // when tied to a specific session
  ts: string;               // ISO8601 server-emitted
}
```

---

## Event vocabulary

Stable string enum — extend, never rename. New optional fields are backward-compatible.

| `event:` line       | Purpose                        | Consumed by         |
|---------------------|--------------------------------|---------------------|
| `session.started`   | New session trivially spawned  | Sessions list       |
| `session.title`     | Title renamed or pinned/unpin  | Sessions list       |
| `session.archived`  | Session archived               | Sessions list       |
| `session.context`   | Context stats refreshed        | Detail panel (Context tab) |
| `chat.message`      | A new message landed in thread | Chat conversation   |
| `chat.messageEdit`  | Replacement (token streaming)  | Chat conversation   |
| `trace.step`        | Agent trace step started/updated | Detail panel (Trace) |
| `trace.completed`   | All trace steps for a turn finished | Detail panel (Trace) |
| `approval.requested`| Trace hit a guard; needs user decision | Detail panel (Approval) |
| `approval.resolved` | User/server already resolved   | Detail panel (Approval) |
| `queue.row`         | Queue row created/updated      | Dashboard Queue     |
| `queue.deleted`     | Queue row removed              | Dashboard Queue     |
| `health.changed`    | A health row flipped status    | Dashboard Health    |
| `placeholder`       | reserved (legacy trade messages) | reserved           |

---

## Payloads

### `session.started`

```ts
{
  sessionId: string;
  title: string;
  source: 'cli' | 'gateway' | 'cron' | 'telegram' | 'dashboard';
  startedAt: string;
}
```

### `session.title`

```ts
{
  sessionId: string;
  title: string;
  pinned?: boolean;
}
```

### `session.archived`

```ts
{ sessionId: string }
```

### `session.context`

```ts
{
  sessionId: string;
  stats: ContextStats;     // same shape as GET /sessions/:id/context
}
```

### `chat.message`

```ts
{
  sessionId: string;
  message: ChatMessage;    // same shape as in ThreadResult
}
```

### `chat.messageEdit`

```ts
{
  sessionId: string;
  messageId: string;
  content: string;         // new full content (not diff); replaces prior
  tokens?: number;
}
```

### `trace.step`

```ts
{
  sessionId: string;
  traceId: string;          // trace id within session
  step: TraceEntry;         // same as GET /sessions/:id/trace element
  pendingApproval?: boolean;// when true → also emit approval.requested
}
```

### `trace.completed`

```ts
{
  sessionId: string;
  traceId: string;
  status: Tone;
  totalDurationMs: number;
  tokensUsed: number;
}
```

### `approval.requested`

```ts
{
  sessionId: string;
  traceId: string;
  tool: string;             // e.g. "terminal.run"
  preview: string;          // one-line description, surfaced in Approval tab
  fields?: Record<string, unknown>;  // tool inputs (sanitized)
  expiresAt: string;        // auto-deny if unread by then
}
```

### `approval.resolved`

```ts
{
  sessionId: string;
  traceId: string;
  outcome: 'approve' | 'deny' | 'auto-deny';
  resolvedBy: 'user' | 'system';
  reason?: string;
}
```

### `queue.row`

```ts
{
  row: QueueRow;            // same as GET /dashboard/queue element; upsert by id
}
```

### `queue.deleted`

```ts
{ id: string }
```

### `health.changed`

```ts
{
  row: HealthRow;           // same as GET /dashboard/health element; upsert by name
}
```

---

## Filter channels

The server MAY scope an SSE subscription. v1 client opens one fat stream (no filter); v2 may add `?session=<id>` to scope to one session. Subscribers should ignore `sessionId` mismatches silently (no error spam).

---

## WebSocket fallback

Not in v1. If the backend team prefers WS over SSE, the **event types** above stay identical — only the transport changes.

---

## Reservation registration (v2 client)

```ts
// src/hooks/useLiveSession.ts (v2 — file does not exist in v1)
import { useEffect } from 'react';

export function useLiveSession(sessionId: string, onEvent: (e: SSEEvent) => void) {
  useEffect(() => {
    if (!import.meta.env.VITE_API_BASE_URL) return; // mock mode → no stream
    const es = new EventSource(
      `${import.meta.env.VITE_API_BASE_URL}/events?session=${sessionId}`
    );
    for (const ev of [
      'chat.message', 'chat.messageEdit',
      'trace.step', 'trace.completed',
      'session.context', 'approval.requested', 'approval.resolved',
    ]) es.addEventListener(ev, (e) => onEvent({ type: ev, payload: JSON.parse((e as MessageEvent).data) }));
    return () => es.close();
  }, [sessionId, onEvent]);
}
```

Both `useLiveSession()` (per-session) and a future `useLiveDashboard()` (global queue + health) hang off the same vocabulary. No public type changes when v2 lands.
