# Telegram Mini App — auth flow

How the HERMES Web UI bundle ships as a Telegram Mini App. v1 ships the bundle only — the auth flow is **fully reserved**, no client-side auth code touches `src/api/client.ts` until v2.

## Bundle layout

The same Vite output that serves `/` also serves `/mini-app/*`. The Mini App entry point is `src/main.tsx` re-used with a single difference: a query/init step that:

1. Reads `window.Telegram.WebApp.initData` (only available inside Telegram).
2. POSTs it to `POST /api/mini-app/auth`.
3. Receives a short-lived JWT (`~15 min`).
4. Stores the JWT in `sessionStorage` under key `hermes-web-ui.mini-app.jwt`.
5. Attaches `Authorization: Bearer <jwt>` to every subsequent `client.ts` fetch call.

A v2 implementation does (1)–(5); v1 **skips the entire step** — `client.ts` ignores `VITE_MINI_APP` and `initData` is never read.

## Auth flow

```
Telegram client
   │
   ──► open https://your-hermes/mini-app/  (loads Vite bundle for the Mini App)
   │
   ◄── window.Telegram.WebApp.initData = "query_id=...&user=...&auth_date=...&hash=..."
   │
   ──► POST /api/mini-app/auth
        Header: X-Telegram-Init-Data: <initData>           ← server-side canonical
        Body:   { initData }                                ← optional mirror (debug)
   │
   ◄── 200 { token, expiresAt, sessionId, user: { id, username?, firstName? } }
   │
   ──► All subsequent requests
        Header: Authorization: Bearer <token>             (until expiresAt)
   │
   ──► 401 → silently re-POST /api/mini-app/auth (no user prompt)
```

### Server-side must

- Validate `initData` hash signature against Telegram Bot API (HMAC-SHA256 with bot token + `WebAppData` secret).
- Issue JWT with `sub = telegram user id`, `account = "telegram"`, `exp = now + 15min`.
- Bind sessions to user so cross-user access is impossible.

### Client-side must

- Never persist JWT to `localStorage` (XSS blast radius). `sessionStorage` only.
- Auto-refresh: when a call returns 401 and `initData` is still readable, re-POST `/api/mini-app/auth` once. On second 401, surface "reopen from Telegram" toast.
- Respect Telegram's `themeParams` (already aligned with our `data-theme="light|dark"` attribute — the host page sets `data-theme` from `WebApp.themeParams.bg_color` before React mounts).

### Trust boundary

The Mini App IS served from your origin and IS inside Telegram's WebView. Treat the JWT as the only auth; initData by itself is **not** trusted. Server is the only judge.

---

## v1 reservation status

- ✅ Mini App mode = Off by default. `src/api/client.ts` has no `initData` references and no JWT header injection.
- ✅ Bundle output (`dist/`) builds identically regardless of `VITE_MINI_APP`. The env var is read **only at fetch time**; v1 silent → no-op.
- ✅ Backend `/api/mini-app/auth` contract documented (`docs/API.md` § Mini App auth).
- ✅ `sessionStorage` key reserved (`docs/CONFIG.md` — `hermes-web-ui.mini-app.jwt`).
- ⏸ v2 work: impl inside `client.ts`. v1 client untouched.

---

## What v2 has to add (out of scope here)

1. **MiniApp gate hook** — `src/hooks/useMiniApp.ts` reads initData and stores JWT.
2. **client.ts fetch wrapper** — prepend `Authorization: Bearer <jwt>` (and `X-Telegram-Init-Data` only on `/api/mini-app/auth`).
3. **JWT refresh on 401** — single retry, then toast.
4. **theme sync** — `useEffect` mirrors `WebApp.themeParams.bg_color` → `data-theme`.
5. **back-button routing** — `WebApp.BackButton.show()/onClick(() => navigate(-1))` for chat sessions.

All five are v2 hooks. v1 architecture has the seams; no override here.

---

## Testing the reservation

Today (v1):

```bash
npm run dev
# Visit http://localhost:5173/ — works as a normal SPA.
# Visit http://localhost:5173/mini-app/ — also works as a normal SPA (no auth prompt).
# `window.Telegram` is undefined → client.ts short-circuits.
```

After v2 lands:

```bash
# Open via Telegram:
# t.me/your_hermes_bot/app  →  /mini-app/  →  initData flow
```

The endpoint contract (`docs/API.md` § Mini App auth) is the only cross-v1/v2 source of truth; the JWT shape, header names, expiration policy are server decisions referenced from this doc.
