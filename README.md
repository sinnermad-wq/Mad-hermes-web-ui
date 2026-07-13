# HERMES Web UI · v1

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
    UI/     Card · KPI · Tabs · Badge · DataTable · Placeholder (mock chart box)
  pages/
    Chat/         Session list · Conversation · Detail panel (Trace / Context / Approval)
    Dashboard/    Overview · Health · Review · Queue
    Sessions/     Recent · Pinned · Archived
    Settings/     Profile · Appearance · Channels · Advanced
  hooks/          useMediaQuery · useTheme
  theme/          tokens.css · base.css  (light + dark via data-theme)
  api/client.ts   Single fetch surface — today returns mocks, swap to fetch() later
  mock/data.ts    Deterministic seedable data
```

## Desktop vs. mobile

- **Desktop (≥ 768px)**: persistent left **Sidebar** with the four primary destinations.
- **Mobile (< 768px)**: sidebar collapses into a **BottomNav** with 4 icon buttons. Chat's 3-column layout collapses to single column with the detail panel revealed via a tab strip above the conversation.
- Theme: `data-theme="light|dark"` on `<html>`, persisted to `localStorage` and toggleable from Settings → Appearance.

## Reserved integration points (not wired in v1)

`src/api/client.ts` documents every endpoint slot:

| Slot | Today | Tomorrow |
|------|-------|----------|
| `GET  /api/sessions` | returns `sessionsMock` | real list with filter= |
| `GET  /api/sessions/:id/messages` | returns `chatThreadMock` | thread + role tokens |
| `GET  /api/sessions/:id/trace` | returns `traceMock` | SSE stream `events?session=` |
| `GET  /api/sessions/:id/context` | returns `contextMock` | live context-stats |
| `POST /api/sessions/:id/messages` | stub echo with note | real agent invocation |
| `POST /api/sessions/:id/approval/:traceId` | logs and ok=true | guard real tool execution |
| `GET  /api/dashboard/{overview,health,review,queue}` | mock rows | live metrics |
| `GET  /api/dashboard/blocks?area=` | empty array | dashboard-card registry (daily-xauusd-bot charts drop in here) |
| `SSE  /api/events` | n/a | push updates to Trace panel and queue |
| `POST /api/mini-app/auth` | n/a | Telegram Mini App initData → JWT |

The ChartBlock / Dashboard block shape is `DashboardBlockSpec` in `client.ts` — same shape the existing `daily-xauusd-bot` package emits, so a single telemetry API can serve both in v2.

Telegram Mini App: same Vite bundle, served as a static sub-app at `/mini-app/*`. Auth exchanges `initData` server-side (slot reserved, no client code touched).

## What v1 deliberately does NOT do

- No real auth — Settings → Channels is a placeholder.
- No persistent DB — everything is in mock.
- No write paths — approval/chat only console.log via the reserved API.
- No real agent execution — message send returns a stub string.
- No stream subscriptions — SSE hookup deferred.

## Smoke test

```bash
npm run build                                 # tsc + vite, no errors
npx vite preview --port 4173                  # serve dist, open http://localhost:4173
```

Manual checks on http://localhost:5173:

- Navigate Chat / Dashboard / Sessions / Settings — top bar crumb updates, route activates.
- Click a session row in Chat → conversation loads, detail panel switches Trace/Context/Approval.
- In Dashboard, switch Overview/Health/Review/Queue → each shows mock data.
- In Sessions, switch Recent/Pinned/Archived → only matching rows render.
- Toggle theme via Settings → Appearance → theme flips, persists across reload.
- Resize viewport below 768 → sidebar hides, bottom nav appears.

## Status

v1 ships April 2026. v2 wiring lives behind the reservations in `src/api/client.ts`.
