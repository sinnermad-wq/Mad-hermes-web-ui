# HERMES Web UI · v2b

Operations-console shell for HERMES — desktop + mobile. v1 is **UI only**: no backend, no auth, no DB wiring. All data is mock. Designed so a FastAPI backend, dashboard blocks, and a Telegram Mini App can drop in later without rewrites.

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

Plus `.env.example` at the repo root — copy to `.env.local` to flip modes.

## Desktop vs. mobile

- **Desktop (≥ 768px)**: persistent left **Sidebar** with the four primary destinations.
- **Mobile (< 768px)**: sidebar collapses into a **BottomNav** with 4 icon buttons. Chat's 3-column layout collapses to single column with the detail panel revealed via a tab strip above the conversation.
- **404 fallback**: any unknown route → `NotFoundPage` listing the four primary destinations and a back-to-Chat link. Crumb in TopBar reads `404`.

## Mode switching (env-only; no code change)

```env
# .env.local — see .env.example
VITE_API_BASE_URL=                # empty → mocks (v1 default)
VITE_API_BASE_URL=http://localhost:8000   # real backend (v2)
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
3. POST /api/sessions/:id/messages → 201 on success, 400/404/500 on error
4. On success: 600ms delay → thread refresh → full thread including Hermes reply
5. On error: optimistic message rolled back, input restored, error shown for 4s

**Not wired in v2b:** SSE, Mini App auth, pinned-unread persistence, dashboard write path.

## DashboardBlockSpec alignment

`src/api/client.ts` exports a tagged-union `DashboardBlockSpec` shape (`kpi | chart | table | placeholder`). Same shape the existing `daily-xauusd-bot` package emits, so a single telemetry API can serve both in v2. See `docs/API.md` § Dashboard blocks.

## Telegram Mini App reservation

- v1 ships the **bundle only**, not the auth flow.
- `src/api/client.ts` exposes `MiniAppAuthBody`, `MiniAppAuthResp`, and `MINI_APP_JWT_STORAGE_KEY` (a `sessionStorage` key, **not** `localStorage`).
- v2 work: implement the JWT exchange hook + 401-refresh inside `client.ts` only. v1 client untouched.

## SSE reservation

`src/api/client.ts` exports:
- `SSEEvent<T>` envelope
- `SSEEventType` stable string enum (`session.started`, `chat.message`, `trace.step`, `queue.row`, …)
- `getSseUrl()` reader that respects `VITE_SSE_URL` or derives from `VITE_API_BASE_URL`.

v1 client never opens a stream. v2 hooks (`useLiveSession()`, `useLiveDashboard()`) hang off the existing types without API surface changes. See `docs/SSE.md`.

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

v1 ships April 2026. v2 wiring lives behind the reservations in `src/api/client.ts` and the contract docs in `docs/`.
