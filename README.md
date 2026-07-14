# HERMES Web UI · v0.2.0

Operations-console shell for HERMES — desktop + mobile. v0.2.0 wires a FastAPI backend (read + write), REST API, and SSE live updates on top of a React 19 + TypeScript SPA. Default mode still ships with mock data; flip `VITE_API_BASE_URL` to connect to the real Hermes state.db.

## Run

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # static dist/
npm run preview   # serve built bundle
```

## Layout

```
src/
  main.tsx                              Entry
  App.tsx                               Router + Shell layout
  components/
    Shell/  Sidebar (desktop) · BottomNav (mobile) · TopBar
    UI/     Card · KPI · Tabs · Badge · DataTable · Placeholder
  pages/
    Chat/         Session list · Conversation · Detail panel (Trace / Context / Approval)
    Dashboard/    Overview · Health · Review · Queue
    Sessions/     Recent · Pinned · Archived
    Settings/     Profile · Appearance · Channels · Advanced
    NotFound/     404 fallback for unknown routes
  hooks/          useMediaQuery · useTheme
  theme/          tokens.css · base.css  (light + dark via data-theme)
  api/client.ts   Single fetch surface — today returns mocks, swap to fetch() later
  mock/data.ts    Deterministic seedable data
```

## Documentation

| Doc | What it covers |
|-----|----------------|
| [`docs/API.md`](docs/API.md) | Frozen request / response shape for every mock endpoint. Source of truth for `src/api/client.ts` ↔ FastAPI binding in v2. |
| [`docs/SSE.md`](docs/SSE.md) | Server-sent event envelope, event-vocabulary enum, per-event payload typings, and which panel consumes each event. |
| [`docs/MINI_APP.md`](docs/MINI_APP.md) | Telegram Mini App auth flow (initData → JWT), trust boundary, v1 reservation status, and the v2 hook list. |
| [`docs/CONFIG.md`](docs/CONFIG.md) | `VITE_*` env vars, mode-switch matrix (mock / real / mini-app), and the localStorage key map. |
| [`docs/web_ui_improvement_log.md`](docs/web_ui_improvement_log.md) | Ongoing UX feedback log — for accumulating day-to-day pain points before v0.3.0 planning. |

Plus `.env.example` at the repo root — copy to `.env.local` to flip modes.

## Desktop vs. mobile

- **Desktop (≥ 768px)**: persistent left **Sidebar** with the four primary destinations.
- **Mobile (< 768px)**: sidebar collapses into a **BottomNav** with 4 icon buttons. Chat's 3-column layout collapses to single column with the detail panel revealed via a tab strip above the conversation.
- **404 fallback**: any unknown route → `NotFoundPage` listing the four primary destinations and a back-to-Chat link. Crumb in TopBar reads `404`.

## Mode switching (env-only; no code change)

```env
# .env.local — see .env.example
VITE_API_BASE_URL=                # empty → mocks (v1 default)
VITE_API_BASE_URL=http://localhost:8080   # real backend (v2)
VITE_MINI_APP=1                   # enable Mini App auth header (v2)
```

v1 client code in `src/api/client.ts` does not actually issue any network calls when `VITE_API_BASE_URL` is empty — the public type surface and function shapes are already correct for v2 (`fetch()` swaps in without touching pages, hooks, or components). Full details in `docs/CONFIG.md`.

## v2a: Real Hermes Sessions via API Server

v2a wires `src/api/client.ts` to a real FastAPI server that reads directly from
Hermes `state.db`. Sessions list, message history, context, trace, and all four
dashboard tabs come from the live SQLite store — no mocks.

**Start the API server** (port 8080, reads from `~/.hermes/state.db`):

```bash
# Windows
start-api.bat

# Unix/macOS
chmod +x start-api.sh && ./start-api.sh

# Or manually:
python -m uvicorn api_server.main:app --port 8080 --host 0.0.0.0
```

**Connect the web UI** — add to `.env.local`:
```
VITE_API_BASE_URL=http://localhost:8080
```

Then `npm run dev`. All 8 read endpoints work:

| Endpoint | Status |
|----------|--------|
| `GET /api/sessions?filter=recent\|archived\|pinned` | ✅ |
| `GET /api/sessions/:id/messages` | ✅ |
| `GET /api/sessions/:id/context` | ✅ |
| `GET /api/sessions/:id/trace` | ✅ |
| `GET /api/dashboard/overview` | ✅ |
| `GET /api/dashboard/health` | ✅ |
| `GET /api/dashboard/review` | ✅ |
| `GET /api/dashboard/queue` | ✅ |

### v2b — Chat write path (this branch)

**Scope:** POST /api/sessions/:id/messages + Chat UI submit handler.

**Start the API server:**
```bash
# Terminal 1 — API server (needs Hermes state.db write access)
python -m uvicorn api_server.main:app --port 8080 --host 0.0.0.0
# Or use the helper:
start-api.bat        # Windows
./start-api.sh       # Unix/macOS
```

**Connect the web UI** — same `.env.local` as v2a:
```
VITE_API_BASE_URL=http://localhost:8080
```

**Write endpoint:**

| Method + Path | Status | Notes |
|---|---|---|
| `POST /api/sessions/:id/messages` | ✅ | Writes to Hermes state.db; Hermes processes asynchronously |

**Note on async response:** Hermes processes messages via the ACP adapter (stdio transport). After POST succeeds, the assistant reply is written to state.db by Hermes asynchronously. Callers should:
- Poll `GET /api/sessions/:id/messages` after a short delay to pick up the reply
- Or wait for SSE (v2c) for real-time push

**UX flow:**
1. User types in Chat textarea → Enter or Send button
2. `sending=true` → input cleared → user message shown immediately (optimistic)
3. POST /api/sessions/:id/messages → 201 on success, 400/404/**503** on error
4. On success: 600ms delay → thread refresh → full thread including Hermes reply
5. On error: optimistic message rolled back, input restored, error shown for 4s

### v2b.1 — Write hardening (this branch)

**Scope:** SQLite write path stability and concurrency safety.

**What was done:**
1. `busy_timeout=5000` on both read and write connections — SQLite waits up to 5s for a lock before giving up.
2. WAL mode confirmed on every connection; `_get_wconn()` promotes to WAL if needed.
3. Write transaction is as short as possible: one INSERT + one UPDATE + commit, all non-blocking.
4. `database is locked` → `HTTP 503` with stable error shape:
   ```json
   { "detail": "database is locked — Hermes is writing. Try again in a moment." }
   ```
5. Frontend detects locked 503 and shows a **warning-coloured** message (`🔒 Database is busy — Hermes is mid-write. Try again in a moment.`) instead of a generic error.

**API error shape summary:**

| Status | Condition | Detail |
|--------|-----------|--------|
| 400 | Empty `content` field | `"content is required"` |
| 404 | Session does not exist | `"session not found"` |
| 503 | `database is locked` (Hermes mid-write) | `"database is locked — Hermes is writing. Try again in a moment."` |
| 500 | Other SQLite error | `"postMessage failed: HTTP 500"` |

**Concurrency scenario — when does 503 happen?**
- Hermes ACP uses `mode=normal` locking + WAL. Reads never block.
- Our API server requests a write lock. If Hermes is mid-write at exactly the same moment, we wait up to 5s (`busy_timeout`). If Hermes completes its write within 5s, we succeed. If not, 503 is returned.
- **Rare window**: Hermes write typically completes in <100ms. The 5s timeout is very conservative.
- **Mitigation**: Stop Hermes agent while actively using the web UI's write features to eliminate locked errors entirely.

**Not wired in v2b.1:** SSE, Mini App auth, pinned-unread persistence, dashboard write path.

### v2c — Read-only SSE (this branch)

**Scope:** `GET /api/events` SSE endpoint + `useLiveTrace` / `useLiveQueue` hooks.

**Architecture:**
- Background thread polls `state.db` every 2 seconds using read-only connections (`mode=ro`) — never conflicts with Hermes writes
- Events pushed into a shared thread-safe queue
- `StreamingHttpResponse` with async generator yields events to each SSE client
- `?session=<id>` query param scopes trace events to a single session (queue events always emitted)

**Event types emitted:**

| `event:` | Trigger |
|---|---|
| `trace.delta` | New tool-role message in session |
| `trace.done` | Assistant reply detected after tool messages |
| `queue.snapshot` | On first poll — full queue state |
| `queue.row` | Cron session added or changed |
| `queue.alert` | Cron session ends unexpectedly |

**Reconnect strategy:**
- Exponential back-off: 1s → 2s → 4s → 8s → 16s → max 30s
- Max 5 retries, then enters `'closed'` state
- On `'closed'`: components fall back to one-shot REST calls
- Heartbeat `: ping\n\n` sent every 15s to prevent proxy timeouts

**Frontend hooks:**

```ts
// Chat Trace panel — replaces REST-only getTrace()
useLiveTrace(activeId, setTrace);

// Dashboard Queue panel — replaces REST-only getQueue()
useLiveQueue(setRows, addAlertCallback);
```

**SSE endpoint shape:**
```
GET /api/events?session=20260713_215313_cf2f6e
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

id: 1
event: queue.snapshot
data: {"rows":[{"id":"...","kind":"cron","name":"...","status":"running",...}]}

id: 2
event: trace.delta
data: {"sessionId":"...","step":{"id":"...","label":"tool.terminal.run",...}}

id: 3
event: trace.done
data: {"sessionId":"...","status":"ok","totalDurationMs":320,"tokensUsed":42}
```

## DashboardBlockSpec alignment

`src/api/client.ts` exports a tagged-union `DashboardBlockSpec` shape (`kpi | chart | table | placeholder`). Same shape the existing `daily-xauusd-bot` package emits, so a single telemetry API can serve both in v2. See `docs/API.md` § Dashboard blocks.

## Telegram Mini App reservation

- v1 ships the **bundle only**, not the auth flow.
- `src/api/client.ts` exposes `MiniAppAuthBody`, `MiniAppAuthResp`, and `MINI_APP_JWT_STORAGE_KEY` (a `sessionStorage` key, **not** `localStorage`).
- v2 work: implement the JWT exchange hook + 401-refresh inside `client.ts` only. v1 client untouched.

## SSE — implemented in v2c

`GET /api/events` streams read-only live events. Clients use `openEventSource()` (low-level) or `useLiveTrace()` / `useLiveQueue()` hooks. See `docs/SSE.md` for full event schema and payload shapes.

## Smoke test

```bash
npm run build                                 # tsc + vite, no errors  ✓
npx vite preview --port 4173                  # serve dist, open http://localhost:4173
```

Manual checks on http://localhost:5173:

- Navigate Chat / Dashboard / Sessions / Settings — top bar crumb updates, route activates.
- Visit `/nope` — NotFoundPage renders with back-to-Chat link; crumb reads "404".
- Click a session row in Chat → conversation loads, detail panel switches Trace/Context/Approval.
- In Dashboard, switch Overview/Health/Review/Queue → each shows mock data.
- In Sessions, switch Recent/Pinned/Archived → only matching rows render.
- Toggle theme via Settings → Appearance → theme flips **and persists across reload** (localStorage key `hermes-web-ui.theme`).
- Resize viewport below 768 → sidebar hides, bottom nav appears.

## Status

v0.2.0 (July 2026) is the current release. Full stack: React 19 SPA + FastAPI backend + SQLite. See CHANGELOG.md for what changed since v0.1.
