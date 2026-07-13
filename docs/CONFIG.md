# HERMES Web UI · Configuration

v1 ships with **mocks only** — no real network calls. When the FastAPI backend lands, flip a single env var to switch the data source. The `src/api/client.ts` module is the single place that needs to change.

## Front-end env vars

This is a Vite SPA. All env vars must start with `VITE_` to be inlined into the bundle.

`.env.example`:

```env
# When unset → keep mocks (default for v1).
# When set (any truthy string) → all functions in src/api/client.ts route
# requests to `${VITE_API_BASE_URL}`.
VITE_API_BASE_URL=

# Optional: override the SSE endpoint prefix if backend differs.
# Default: derived from VITE_API_BASE_URL + "/events"
VITE_SSE_URL=

# Optional: opt into Telegram Mini-App mode.
# When '1' (or truthy), the Mini-App entry uses /mini-app/* and expects
# an X-Telegram-Init-Data header on first POST /api/mini-app/auth.
# v1 still shows the same UI shell — only the env-flag changes routing.
VITE_MINI_APP=
```

Copy this file to `.env.local` and edit:
```bash
cp .env.example .env.local
```

## Switching modes

### Mode 1 — Mocks (default; v1 ships here)

`VITE_API_BASE_URL` is empty / missing. Every exported function in `src/api/client.ts` resolves synchronously against `src/mock/data.ts`. No network IO. Safe offline.

### Mode 2 — Real backend

```env
VITE_API_BASE_URL=http://localhost:8000
```

Every `listSessions()` / `getThread()` / `getTrace()` / `getContext()` / `postMessage()` / `approveToolEvent()` / `getOverview()` / `getHealth()` / `getReview()` / `getQueue()` / `getDashboardBlocks()` call gets rewritten to:

```ts
fetch(`${import.meta.env.VITE_API_BASE_URL}/api/sessions/${id}/messages`)
```

whose exact path & shape comes from `docs/API.md` (the contract doc). Nothing in pages, hooks, or components has to change — they all import via `client.ts`.

### Mode 3 — Telegram Mini App (separate bundle or same bundle, gated by env)

```env
VITE_MINI_APP=1
VITE_API_BASE_URL=https://your-hermes-backend
```

When the mini-app flag is on, the **entry** stays the same but:

- `client.ts` adds an `X-Telegram-Init-Data` header to `/api/mini-app/auth` exchange (computed in `getInit()` on app boot — see `docs/MINI_APP.md`).
- After successful exchange, a short-lived session JWT is stored in `sessionStorage` (not `localStorage`) and attached as `Authorization: Bearer <jwt>` to every subsequent call.
- Same UI contract — only auth header differs.

`src/api/client.ts` is the only file that knows the URL, the header name, or the storage location. Pages never see the difference.

## Reading env in code

```ts
import.meta.env.VITE_API_BASE_URL ?? ''   // string
import.meta.env.VITE_MINI_APP === '1'     // boolean check; any truthy string works
```

Vite types env via `vite/client.d.ts` (auto-imported). Use `?? ''` to satisfy `noUncheckedIndexedAccess`.

## localStorage keys (already in use)

| Key | Owner | Purpose |
|-----|-------|---------|
| `hermes-web-ui.theme` | `useTheme` | `'light' \| 'dark'`. Persisted on toggle; falls back to `prefers-color-scheme`. |
| `hermes-web-ui.mini-app.jwt` (reserved; **not yet used in v1**) | `client.ts` (v2) | Short-lived Telegram Mini App JWT, mirrored from `sessionStorage`. |

When the Mini App lands, the JWT goes into `sessionStorage` first and is copied to `localStorage` only if `Remember me` is enabled — both keys above already exist as the reservation.
