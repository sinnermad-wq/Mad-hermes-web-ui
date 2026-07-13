# HERMES Web UI · v1 Doc Index

Frozen at v1 freeze. The contract docs are the **source of truth** for the FastAPI backend, SSE event publisher, and Telegram Mini App server team.

| File | Audience | Scope |
|------|----------|-------|
| [`API.md`](API.md) | FastAPI backend devs | Every endpoint's HTTP method, URL, query/body params, response typings, status codes, and the dashboard-block shape. |
| [`SSE.md`](SSE.md) | FastAPI event publisher / v2 hook dev | Server-sent event envelope, full event vocabulary, per-event payload typings, per-consumer subscription map. |
| [`MINI_APP.md`](MINI_APP.md) | Mini App backend + v2 client hooks | Telegram `initData` → JWT flow, trust boundary, JWT/sessionStorage/header rules, v2 hook inventory. |
| [`CONFIG.md`](CONFIG.md) | Front-end devs / ops | `VITE_*` env vars, mock / real / mini-app mode-switch matrix, localStorage key map. |

Plus repo root:

| File | Audience | Scope |
|------|----------|-------|
| [`../README.md`](../README.md) | Anyone | What v1 is, how to run, smoke-test checklist, doc cross-links. |
| [`../.env.example`](../.env.example) | Front-end devs | Copy to `.env.local` and edit; tells you exactly which keys wire each mode. |

## How v2 should land a feature

Example: "wire the live Trace panel."

1. **Schema already exists** — `docs/SSE.md` lists `trace.step` and `trace.completed` events with full payload typings.
2. **API hooks already exists** — `src/api/client.ts` exports `SSEEvent<T>` + `SSEEventType` + `getSseUrl()`.
3. **Implement** — write `src/hooks/useLiveSession.ts` subscribing to `EventSource(getSseUrl() + '?session=' + id)`. No public-type changes.
4. **UI slot exists** — `<DetailPanel>` in `src/pages/Chat/Chat.tsx` already renders the Trace tab; pass live `TraceEntry[]` into its render. No rewrite.

Anything that *can't* be done only by adding files under `src/hooks/` and editing page props means v1 missed a contract — fix the contract doc, not the runtime code.
