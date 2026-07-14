# Changelog

All notable changes to **hermes-web-ui** are documented here.

---

## v0.2.0

### What is this

A React 19 + TypeScript operations console for HERMES.  
The original v1 was a mock-only UI shell; v2a–v2c wire in the real backend, chat write path, and SSE live updates.

### Stack

- Frontend: React 19, TypeScript, Vite, oxlint
- Backend: FastAPI + SQLite (reads ~/.hermes/state.db)
- Transport: REST (read/write) + SSE (live updates)

### v2c — Read-only SSE

- `GET /api/events` SSE stream with 5 event types: `trace.delta`, `trace.done`, `queue.snapshot`, `queue.row`, `queue.alert`
- `useLiveTrace(sessionId, setTrace)` hook for the Chat Trace panel
- `useLiveQueue(setRows, addAlert)` hook for the Dashboard Queue panel
- Exponential back-off reconnect (1s → 30s, max 5 retries), then fallback to REST
- Background poll thread using read-only DB connections, avoiding write conflicts with Hermes

### v2b.1 — Write hardening

- `busy_timeout=5000` on both read and write connections
- `database is locked` → `HTTP 503` with `Retry-After: 5`
- Frontend detects locked 503 and shows an amber warning instead of a generic error

### v2b — Chat write path

- `POST /api/sessions/:id/messages` writes a user message to Hermes `state.db`
- Optimistic UI with rollback on error

### v2a — Real-read APIs

- FastAPI server on port 8080 wired to Hermes `state.db`
- `listSessions`, `getThread`, `getTrace`, `getContext`, `getOverview`, `getHealth`, `getReview`, `getQueue`

### Running

```bash
# API server
python -m uvicorn api_server.main:app --port 8080 --host 0.0.0.0

# Web UI
npm install && npm run dev

# Connect to real backend
# .env.local
VITE_API_BASE_URL=http://localhost:8080
```

### Notes

- If Hermes is actively writing to `state.db`, chat write requests may temporarily return 503 Service Unavailable.
- SSE is read-only and used for live Trace and Queue updates.

---

## v0.1.0

Initial release. Mock-only UI shell — no backend, no auth, no DB wiring. All data is deterministic seedable mock data. Designed as a drop-in shell for future FastAPI backend wiring.

---

## GitHub Release Steps

To create the **v0.2.0** release on GitHub:

1. Go to: `https://github.com/sinnermad-wq/Mad-hermes-web-ui/releases/new`

2. **Tag version:** `v0.2.0`  
   **Target branch:** `master`

3. **Release title:** `hermes-web-ui v0.2.0`

4. **Description:** Copy the entire `## v0.2.0` section from `CHANGELOG.md` above and paste it in.

5. If this is for internal/development use only, check **"This is a pre-release"**.

6. Click **"Publish release"**.

> **Note:** Tags are created manually on GitHub. No CI automation is required for this release.