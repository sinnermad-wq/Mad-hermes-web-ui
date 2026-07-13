# API contract — HERMES Web UI v1

Frozen as of v1 freeze. Source of truth for `src/api/client.ts` ↔ FastAPI backend. v1 returns mocks for every endpoint listed; v2 wires these URLs verbatim.

Base path: `VITE_API_BASE_URL/api`.

All requests: `Content-Type: application/json`. Sessions endpoint additionally accepts a `Bearer` JWT in v2 (see `docs/MINI_APP.md`).

---

## Sessions

### `GET /sessions?filter=&search=`

List sessions.

**Query**

| param    | type                                    | default | notes                       |
|----------|-----------------------------------------|---------|-----------------------------|
| `filter` | `'all' \| 'pinned' \| 'archived' \| 'recent'` | `all`   | server may ignore if backed by SQLite view |
| `search` | `string`                                | `""`    | substring match on title + preview |

**Response 200** — `SessionItem[]`

```ts
interface SessionItem {
  id: string;             // e.g. "20260713_135012_56e011dc"
  title: string;          // e.g. "AI AGENT UI"
  preview: string;        // one-line preview (msg snip)
  source: 'cli' | 'gateway' | 'cron' | 'telegram' | 'dashboard';
  status: 'active' | 'idle' | 'archived' | 'error';
  startedAt: string;      // ISO8601
  lastActiveAt: string;   // ISO8601
  messageCount: number;
  pinned?: boolean;
  unread?: number;
}
```

### `GET /sessions/:id`

Single session summary. Same shape as one `SessionItem`, or `404` if not found.

---

## Chat thread

### `GET /sessions/:id/messages?before=&limit=`

Returns the conversation thread for one session, oldest → newest.

**Query**

| param    | type     | default | notes                                    |
|----------|----------|---------|------------------------------------------|
| `before` | `string` | none    | ISO timestamp of last-known message; cursor pagination |
| `limit`  | `number` | `200`   | max messages to return                   |

**Response 200** — `ThreadResult`

```ts
interface ThreadResult {
  sessionId: string;
  messages: ChatMessage[];
  nextCursor?: string;   // pass as `before` next time
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  at: string;            // ISO8601
  tokens?: number;       // optional
  durationMs?: number;   // optional, assistant/tool only
}
```

### `POST /sessions/:id/messages`

Send a user message into the session. Server kicks off (or enqueues) a turn and returns the **immediate** assistant stub; the rest arrives via SSE (`chat.message` events — see `docs/SSE.md`).

**Body** — `PostMessageBody`

```ts
interface PostMessageBody {
  content: string;
  attachments?: Array<{ kind: 'image' | 'file'; url: string; mime: string }>;
}
```

**Response 202** — `ChatMessage` (placeholder for the in-flight assistant turn)

```ts
interface ChatMessage {                        // same as in thread
  id: string;                                  // provisional id; SSE updates may replace
  role: 'assistant';
  content: string;                             // placeholder text pending SSE
  at: string;
  tokens?: number;
  durationMs?: number;
}
```

---

## Agent trace

### `GET /sessions/:id/trace`

The full trace for the latest turn in this session. For live updates use `SSE /events?session=:id` with `trace.*` events.

**Response 200** — `TraceEntry[]`

```ts
interface TraceEntry {
  id: string;
  startedAt: string;            // ISO8601
  durationMs: number;
  label: string;                // e.g. "tools.terminal"
  status: 'ok' | 'warn' | 'err' | 'pending';
  tokens?: number;
  tool?: string;                // tool name when relevant
}
```

---

## Approval

### `POST /sessions/:id/approval/:traceId`

Approve or deny a tool execution flagged for user approval. Server emits `approval.resolved` over SSE afterward.

**Body** — `ApprovalDecision`

```ts
interface ApprovalDecision {
  decision: 'approve' | 'deny';
  reason?: string;             // free-text note
}
```

**Response 200** — `{ ok: true }`

Statuses:
- `200` — recorded
- `404` — trace id not found / already resolved
- `409` — trace is no longer pending

---

## Context stats

### `GET /sessions/:id/context`

Cached context-window stats for the session. Live-updated over SSE (`session.context`).

**Response 200** — `ContextStats`

```ts
interface ContextStats {
  windowUsedPct: number;       // 0..100
  windowTotal: number;         // tokens
  messagesCached: number;
  skillsLoaded: string[];
  memoryHits: number;
  toolsRegistered: number;
}
```

---

## Dashboard

### `GET /dashboard/overview`

```ts
type DashboardKPI = {
  label: string;
  value: string;
  delta?: string;              // e.g. "+12%"
  status?: 'ok' | 'warn' | 'err' | 'pending';
};
```

### `GET /dashboard/health`

```ts
type HealthRow = {
  name: string;
  category: 'core' | 'tool' | 'platform' | 'integration';
  status: 'ok' | 'warn' | 'err' | 'pending';
  detail: string;
};
```

### `GET /dashboard/review`

```ts
type ReviewRow = {
  date: string;                // YYYY-MM-DD
  topic: string;
  predicted: 'bullish' | 'bearish' | 'neutral';
  outcome: 'correct' | 'wrong' | 'partial' | 'pending';
  notes: string;
};
```

### `GET /dashboard/queue`

```ts
type QueueRow = {
  id: string;
  kind: 'cron' | 'webhook' | 'spawn';
  name: string;
  status: 'queued' | 'running' | 'scheduled' | 'paused' | 'err';
  nextRun?: string;            // ISO
  detail?: string;
};
```

### `GET /dashboard/blocks?area=`

Server-side block registry. Areas: `overview | health | review | queue`. The v1 client accepts an empty array; v2 renders blocks delivered by this endpoint. Designed so a single telemetry API can supply the same shape as the existing `daily-xauusd-bot` package's chart cards.

```ts
type DashboardBlockSpec =
  | { id: string; type: 'kpi'; title: string; source?: string; props: { label: string; value: string; delta?: string; status?: string } }
  | { id: string; type: 'chart'; title: string; source?: string; props: { component: string; height?: number; data?: unknown[] } }
  | { id: string; type: 'table'; title: string; source?: string; props: { columns: { key: string; label: string }[]; rows: unknown[] } }
  | { id: string; type: 'placeholder'; title: string; source?: string; props: { height?: number; hint?: string } };
```

The `component` field on a `'chart'` block is a registered React component name (resolved by the host SPA, not the server). v1 ignores unknown components with a graceful `<Placeholder />`.

---

## Telegram Mini App auth (server-side only in v1)

### `POST /api/mini-app/auth`

Exchange Telegram WebApp `initData` for a session JWT. **Server-side reservation only** — v1 client never calls this endpoint. Documented in full at `docs/MINI_APP.md`.

**Body** — `MiniAppAuthBody`

```ts
interface MiniAppAuthBody {
  initData: string;            // raw window.Telegram.WebApp.initData
}
```

**Response 200** — `MiniAppAuthResp`

```ts
interface MiniAppAuthResp {
  token: string;               // short-lived JWT (~15 min)
  expiresAt: string;           // ISO
  sessionId: string;           // server-created session linked to telegram user id
  user: {
    id: number;                // telegram user id
    username?: string;
    firstName?: string;
  };
}
```

---

## Error envelope (FastAPI default → frontend)

FastAPI `HTTPException` flows through unmodified:

```ts
interface ErrorResp {
  detail: string | { msg: string; code?: string }[];
}
```

Client wrapper standardizes to `ApiError { status: number; message: string }` — v2 only.

---

## v1 → v2 swap checklist

1. Add `VITE_API_BASE_URL=http://localhost:8000` to `.env.local`.
2. Rewrite each `async function` in `src/api/client.ts` from `return mock` to `fetch(...)`-backed implementation. No page/hook/component change.
3. Wire SSE in `src/hooks/useLiveSession.ts` (new file, reserved for v2).
4. (Optional) flip `VITE_MINI_APP=1` to add Telegram auth headers.
5. Done. No public-API type changes.

See `docs/SSE.md` and `docs/MINI_APP.md` for the streaming + auth halves.
