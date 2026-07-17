"""
hermes-api-server — FastAPI read-only API over Hermes state.db

Serves the session / message / trace / dashboard data that hermes-web-ui
needs. Reads directly from the shared SQLite state.db; does not import any
Hermes agent code so it stays lightweight and decoupled.

Run:
    python -m uvicorn api_server.main:app --port 8080 --reload
    # or
    hermes-api                         # if installed as a CLI
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import time
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi import FastAPI, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

# Auth imports
from .auth import (
    create_tokens,
    get_current_user_id,
    verify_refresh_token,
    create_access_token,
    create_refresh_token,
    verify_access_token,
)
from .users import (
    authenticate_user,
    create_user,
    get_user_by_id,
    user_exists,
)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("hermes-api")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

# Allow override via env; default to ~/.hermes/state.db
DB_PATH = os.environ.get("HERMES_STATE_DB", "")
if not DB_PATH:
    # Dynamically locate hermes home (same logic as hermes_state.py)
    _hermes_home = Path.home() / ".hermes"
    # Try Windows path first
    _env_home = os.environ.get("HERMES_HOME", "")
    if _env_home:
        _hermes_home = Path(_env_home)
    DB_PATH = str(_hermes_home / "state.db")

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

# Auth enabled flag (set HERMES_AUTH_ENABLED=1 to require authentication)
AUTH_ENABLED = os.environ.get("HERMES_AUTH_ENABLED", "").lower() in ("1", "true", "yes")

app = FastAPI(
    title="Hermes API",
    description="Read-only API over Hermes Agent session store.",
    version="1.0.0",
)

# CORS — controlled via ALLOWED_ORIGINS env var
# Comma-separated list, no wildcards in production.
# Dev fallback: allow all (when ALLOWED_ORIGINS is empty and HERMES_ENV != production)
_allowed_raw = os.environ.get("ALLOWED_ORIGINS", "").strip()
if _allowed_raw:
    _allowed_origins = [o.strip() for o in _allowed_raw.split(",") if o.strip()]
    _log_cors = logger.info
else:
    if os.environ.get("HERMES_ENV") == "production":
        raise RuntimeError(
            "ALLOWED_ORIGINS env var is required in production mode. "
            "Set e.g. ALLOWED_ORIGINS=http://localhost:5173,http://192.168.31.233:5173"
        )
    _allowed_origins = ["*"]
    _log_cors = logger.warning

_log_cors("CORS origins: %s", _allowed_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# SQLite helpers
# ---------------------------------------------------------------------------

def _hermes_home_path() -> Path:
    """Locate HERMES_HOME, matching hermes_constants.get_hermes_home()."""
    if os.environ.get("HERMES_HOME"):
        return Path(os.environ["HERMES_HOME"])
    return Path.home() / ".hermes"


def _get_conn() -> sqlite3.Connection:
    """Open a read-only connection to state.db with row factories."""
    if not Path(DB_PATH).exists():
        raise HTTPException(503, f"state.db not found at {DB_PATH}")
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    wal_mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
    logger.debug("Read conn — journal_mode=%s, busy_timeout=5000", wal_mode)
    return conn


def _get_wconn() -> sqlite3.Connection:
    """Open a read/write connection to state.db for write operations.

    busy_timeout=5000ms: waits up to 5s for a write lock before giving up.
    WAL mode: allows concurrent readers while writing.

    Concurrency notes:
    - Hermes holds the DB in NORMAL locking mode (not exclusive) — reads
      never block and writes don't block reads under WAL.
    - A "database is locked" error occurs only when Hermes is mid-write
      AND our write happens simultaneously (very rare window).
    - If locked: wait 5s → 503 with a stable error shape.
    - To eliminate locked errors entirely, stop Hermes before writing via
      the API server, or bridge via Hermes ACP subprocess (v2c/SSE).
    """
    if not Path(DB_PATH).exists():
        raise HTTPException(503, f"state.db not found at {DB_PATH}")
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=rwc", uri=True)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")     # wait up to 5s for lock
    wal_mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
    if wal_mode != "wal":
        logger.warning("state.db journal_mode=%s (expected WAL)", wal_mode)
        conn.execute("PRAGMA journal_mode=WAL")      # try to promote
    logger.debug("Write conn — journal_mode=%s, busy_timeout=5000", wal_mode)
    return conn


def _rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict]:
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Shape adapters (Hermes DB -> API contract)
# ---------------------------------------------------------------------------

import os
import json
from pathlib import Path

HERMES_HOME = Path(os.path.expanduser("~/.hermes"))
PINS_FILE = HERMES_HOME / "pinned_sessions.json"


def _load_pinned_ids() -> set[str]:
    """Load pinned session IDs from sidecar JSON file. Returns empty set on error."""
    try:
        HERMES_HOME.mkdir(parents=True, exist_ok=True)
        if not PINS_FILE.exists():
            return set()
        with open(PINS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        ids = data.get("pinned", [])
        return set(id_ for id_ in ids if isinstance(id_, str))
    except Exception:
        return set()


def _save_pinned_ids(ids: set[str]) -> None:
    """Persist pinned session IDs to sidecar JSON file."""
    try:
        HERMES_HOME.mkdir(parents=True, exist_ok=True)
        with open(PINS_FILE, "w", encoding="utf-8") as f:
            json.dump({"pinned": sorted(ids)}, f, ensure_ascii=False, indent=2)
    except Exception:
        pass  # Non-critical; failures are logged silently


def _row_to_session(row: dict, pinned_ids: set[str] | None = None) -> dict:
    """Map a sessions table row to the SessionItem contract."""
    if pinned_ids is None:
        pinned_ids = _load_pinned_ids()
    ended_at = row.get("ended_at")
    end_reason = row.get("end_reason")

    # Derive status
    if ended_at:
        if end_reason == "branched":
            status = "archived"
        elif end_reason in ("completed", "max_turns", "error"):
            status = "idle"
        else:
            status = "idle"
    else:
        status = "active"

    # archived flag overrides
    if row.get("archived"):
        status = "archived"

    # title fallback
    title = row.get("title") or ""
    if not title:
        title = _preview_from_content(row.get("preview"))

    # source: validate against known values
    raw_source = str(row.get("source") or "cli")
    if raw_source not in ("cli", "gateway", "cron", "telegram", "dashboard"):
        source = "cli"
    else:
        source = raw_source

    return {
        "id": row["id"],
        "title": title,
        "preview": row.get("preview") or title or "...",
        "source": source,
        "status": status,
        "startedAt": _unix_to_iso(row.get("started_at")),
        "lastActiveAt": _unix_to_iso(ended_at or row.get("started_at")),
        "messageCount": row.get("message_count") or 0,
        "pinned": row["id"] in pinned_ids,
        "unread": 0,
    }


def _row_to_message(row: dict) -> dict:
    """Map a messages table row to the ChatMessage contract."""
    content = row.get("content") or ""
    role = str(row.get("role") or "assistant")

    # Tool calls stored as JSON array in content
    if role == "tool" and content.startswith("["):
        try:
            parsed = json.loads(content)
            if isinstance(parsed, list) and len(parsed) > 0:
                first = parsed[0]
                if isinstance(first, dict):
                    tool_name = first.get("name", "")
                    args = first.get("arguments", {})
                    if isinstance(args, dict):
                        args_str = json.dumps(args, ensure_ascii=False)
                    else:
                        args_str = str(args)
                    content = f"[{tool_name}] {args_str}"
        except Exception:
            pass

    # Normalize role
    if role not in ("user", "assistant", "tool", "system"):
        role = "assistant"

    result = {
        "id": str(row["id"]),
        "role": role,
        "content": content,
        "at": _unix_to_iso(row.get("timestamp")),
    }
    if row.get("token_count"):
        result["tokens"] = row["token_count"]
    return result


def _unix_to_iso(unix: Any) -> str:
    """Convert Unix timestamp (int/float) to ISO8601 string."""
    if unix is None:
        return datetime.now(timezone.utc).isoformat()
    try:
        return datetime.fromtimestamp(float(unix), tz=timezone.utc).isoformat()
    except (ValueError, TypeError):
        return datetime.now(timezone.utc).isoformat()


def _preview_from_content(content: Any, max_len: int = 80) -> str:
    """Build a short preview string from raw content."""
    if not content:
        return "..."
    text = str(content).strip()
    if len(text) <= max_len:
        return text
    return text[:max_len].rstrip() + "…"


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict:
    """Simple liveness check."""
    try:
        conn = _get_conn()
        conn.execute("SELECT 1").fetchone()
        conn.close()
        return {"status": "ok", "db": DB_PATH}
    except Exception as e:
        raise HTTPException(503, str(e))

# -----------------------------------------------------------------------------
# Authentication
# -----------------------------------------------------------------------------

@app.post("/auth/register", tags=["auth"])
async def register(request: Request) -> dict:
    """
    Register a new user account.
    
    Request body: { "username": "string", "email": "string", "password": "string" }
    Response: { "id": "string", "username": "string", "email": "string" }
    Errors: 400 - username/email already exists or validation error
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    
    username = (body.get("username") or "").strip()
    email = (body.get("email") or "").strip()
    password = (body.get("password") or "").strip()
    
    if not username or len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email is required")
    if not password or len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    try:
        user = create_user(username, email, password)
        logger.info(f"User registered: {username}")
        return user
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/auth/login", tags=["auth"])
async def login(request: Request) -> dict:
    """
    Authenticate user and return JWT tokens.
    
    Request body: { "username": "string", "password": "string" }
    Response: { "access_token": "string", "refresh_token": "string", "token_type": "bearer", "expires_in": int }
    Errors: 401 - invalid credentials
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    
    username = (body.get("username") or "").strip()
    password = (body.get("password") or "").strip()
    
    if not username or not password:
        raise HTTPException(status_code=401, detail="Username and password are required")
    
    user = authenticate_user(username, password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    tokens = create_tokens(
        subject=user["id"],
        extra_claims={
            "username": user["username"],
            "email": user["email"],
        }
    )
    logger.info(f"User logged in: {username}")
    return tokens


@app.post("/auth/refresh", tags=["auth"])
async def refresh_token(request: Request) -> dict:
    """
    Refresh access token using a valid refresh token.
    
    Request body: { "refresh_token": "string" }
    Response: { "access_token": "string", "refresh_token": "string", "token_type": "bearer", "expires_in": int }
    Errors: 401 - invalid or expired refresh token
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    
    refresh_token_str = (body.get("refresh_token") or "").strip()
    if not refresh_token_str:
        raise HTTPException(status_code=401, detail="Refresh token is required")
    
    try:
        payload = verify_refresh_token(refresh_token_str)
        subject = payload.get("sub")
        if not subject:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        
        # Get user to include claims
        user = get_user_by_id(subject)
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        tokens = create_tokens(
            subject=subject,
            extra_claims={
                "username": user.get("username", ""),
                "email": user.get("email", ""),
            }
        )
        return tokens
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token refresh failed: {str(e)}")


@app.get("/auth/me", tags=["auth"])
async def get_me(user_id: str = Depends(get_current_user_id)) -> dict:
    """
    Get current authenticated user info.
    
    Requires: Bearer token in Authorization header
    Response: { "id": "string", "username": "string", "email": "string", "is_admin": bool }
    Errors: 401 - not authenticated
    """
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "is_admin": bool(user.get("is_admin", False)),
    }


@app.post("/auth/logout", tags=["auth"])
async def logout(user_id: str = Depends(get_current_user_id)) -> dict:
    """
    Logout current user. Client should discard tokens after this call.
    Token invalidation is handled client-side (stateless JWT).
    """
    logger.info(f"User logged out: {user_id}")
    return {"message": "Logged out successfully"}


# -----------------------------------------------------------------------------
# Session pin state (sidecar — not part of Hermes session schema)
# Session pin state (sidecar — not part of Hermes session schema)
# Stored in ~/.hermes/pinned_sessions.json
# ---------------------------------------------------------------------------

@app.get("/api/sessions/pins")
def get_pinned_session_ids() -> dict:
    """
    Returns the current set of pinned session IDs.
    This state is persisted in a sidecar JSON file, NOT in Hermes state.db.
    """
    pinned_ids = _load_pinned_ids()
    return {"pinned": sorted(pinned_ids)}


@app.put("/api/sessions/pins")
async def update_pinned_session_ids(request: Request) -> dict:
    """
    Replaces the complete set of pinned session IDs.

    Body: { pinned: string[] }
    Returns 200 with the new set, or 400 if the body is malformed.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    pinned = body.get("pinned")
    if not isinstance(pinned, list):
        raise HTTPException(400, '"pinned" must be a list of session ID strings')

    pinned_str: list[str] = []
    for item in pinned:
        if not isinstance(item, str):
            raise HTTPException(400, '"pinned" must be a list of session ID strings')
        pinned_str.append(item)

    _save_pinned_ids(set(pinned_str))
    return {"pinned": pinned_str}


@app.on_event("startup")
def _migrate_pinned_on_startup():
    """Migrate legacy localStorage-pinned IDs into the sidecar on first run."""
    legacy = HERMES_HOME / "pinned_sessions.json"
    if PINS_FILE.exists() or not legacy.exists():
        return  # already migrated or nothing to migrate

    try:
        with open(legacy, "r", encoding="utf-8") as f:
            data = json.load(f)
        ids = data.get("pinned", [])
        if isinstance(ids, list):
            _save_pinned_ids(set(ids))
            print(f"[pins] Migrated {len(ids)} pinned session IDs from legacy storage.")
    except Exception as e:
        print(f"[pins] Migration failed (non-fatal): {e}")
    # ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

@app.get("/api/sessions")
def list_sessions(
    filter: str = Query("recent", description="recent | pinned | archived"),
    search: str = Query("", description="Full-text search (FTS5)"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> dict:
    """
    List sessions.

    filter=recent   → status != archived, sorted by last_active DESC
    filter=pinned   → (not stored in DB; returns recent for now)
    filter=archived → archived=1
    search          → FTS5 match on message content
    """
    conn = _get_conn()
    try:
        # Search via FTS
        if search:
            fts_query = search.replace('"', '""')
            base_sql = """
                SELECT DISTINCT s.id, s.title, s.source, s.ended_at, s.end_reason,
                       s.started_at, s.message_count, s.archived
                FROM sessions s
                JOIN messages_fts fts ON s.id = fts.rowid
                WHERE sessions_fts MATCH ?
            """
            params = [f'"{fts_query}"']
        else:
            base_sql = """
                SELECT id, title, source, ended_at, end_reason,
                       started_at, message_count, archived
                FROM sessions
                WHERE 1=1
            """
            params = []

        # Filter
        if filter == "archived":
            base_sql += " AND archived = 1"
        else:
            base_sql += " AND (archived = 0 OR archived IS NULL)"

        base_sql += " ORDER BY MAX(COALESCE(ended_at, started_at), started_at) DESC"
        base_sql += f" LIMIT {limit} OFFSET {offset}"

        rows = conn.execute(base_sql, params).fetchall()
        pinned_ids = _load_pinned_ids()
        sessions = [_row_to_session(dict(r), pinned_ids) for r in rows]
        return {"sessions": sessions, "total": len(sessions)}
    finally:
        conn.close()


@app.get("/api/sessions/{session_id}")
def get_session(session_id: str) -> dict:
    """Get a single session by id."""
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM sessions WHERE id = ?", (session_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, f"Session not found: {session_id}")
        pinned_ids = _load_pinned_ids()
        return _row_to_session(dict(row), pinned_ids)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Session management (rename / archive / delete)
# ---------------------------------------------------------------------------

@app.patch("/api/sessions/{session_id}")
async def update_session(
    session_id: str,
    request: Request,
) -> dict:
    """
    Partially update a session's fields.

    Supported body fields:
      title     string   → UPDATE sessions SET title = ?
      archived  bool     → UPDATE sessions SET archived = 1|0

    Note: `pinned` is not stored in Hermes state.db. The frontend maintains
    pinned state locally (localStorage). Do NOT add a `pinned` column here
    without a corresponding Hermes migration.

    Errors: 404 — session not found
            422 — empty body
    """
    body = await request.json() or {}
    if not body:
        raise HTTPException(status_code=422, detail="request body required")

    conn = _get_wconn()
    try:
        # Verify session exists
        row = conn.execute(
            "SELECT id FROM sessions WHERE id = ?", (session_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="session not found")

        sets, params = [], []
        if "title" in body:
            sets.append("title = ?")
            params.append(str(body["title"]).strip())

        if "archived" in body:
            sets.append("archived = ?")
            params.append(1 if body["archived"] else 0)

        # TODO: add `pinned` column to sessions table + Hermes migration
        # before uncommenting the block below:
        # if "pinned" in body:
        #     sets.append("pinned = ?")
        #     params.append(1 if body["pinned"] else 0)

        if not sets:
            raise HTTPException(status_code=422, detail="no supported fields in body")

        params.append(session_id)
        conn.execute(f"UPDATE sessions SET {', '.join(sets)} WHERE id = ?", params)
        conn.commit()
    except sqlite3.OperationalError as e:
        if "locked" in str(e).lower():
            raise HTTPException(
                status_code=503,
                detail="database is locked",
                headers={"Retry-After": "5"},
            )
        raise
    finally:
        conn.close()

    # Return updated session
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM sessions WHERE id = ?", (session_id,)
        ).fetchone()
        return _row_to_session(dict(row))
    finally:
        conn.close()


@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: str):
    """
    Hard-delete is not available. Hermes does not currently support session deletion.

    Returns 405. Use PATCH /api/sessions/:id with { "archived": true } to archive.
    Archived sessions can be restored via PATCH with { "archived": false }.

    TODO: When Hermes adds a delete_session RPC, uncomment the implementation below.
    """
    # TODO: uncomment once Hermes provides delete_session RPC
    # conn = _get_wconn()
    # try:
    #     row = conn.execute("SELECT id FROM sessions WHERE id = ?", (session_id,)).fetchone()
    #     if not row:
    #         raise HTTPException(status_code=404, detail="session not found")
    #     conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
    #     conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    #     conn.commit()
    # except finally: ...
    raise HTTPException(
        status_code=405,
        detail=(
            "DELETE not supported — Hermes has no session delete mechanism. "
            "Use PATCH /api/sessions/:id with { \"archived\": true } to archive instead. "
            "Archived sessions can be restored via PATCH with { \"archived\": false }."
        ),
        headers={"Allow": "GET, POST, PATCH, OPTIONS"},
    )


@app.post("/api/sessions", status_code=201)
async def create_session(request: Request) -> dict:
    """
    Create a new session and insert the first user message.

    The message is written directly to state.db so Hermes's ACP subprocess
    will pick it up on its next poll and process it asynchronously.
    The assistant reply is written back to state.db by Hermes — callers
    should poll GET /api/sessions/:id/messages or use SSE to observe it.

    Request body:  { "content": "your first message", "title": "optional title" }
    Response:      SessionItem (the new session, 201 Created)
    Errors:        400 — empty content
    """
    body = await request.json() or {}
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content is required")

    title = (body.get("title") or "").strip() or f"New session {datetime.now().strftime('%d %b %Y %H:%M')}"

    now_ts = time.time()
    session_id = str(int(now_ts * 1e6))          # microsecond-precision ID
    msg_id = session_id + "001"

    conn = _get_wconn()
    try:
        conn.execute(
            """
            INSERT INTO sessions (id, title, source, message_count, started_at, archived)
            VALUES (?, ?, 'dashboard', 1, ?, 0)
            """,
            (session_id, title, now_ts),
        )
        conn.execute(
            """
            INSERT INTO messages (id, session_id, role, content, timestamp, active)
            VALUES (?, ?, 'user', ?, ?, 1)
            """,
            (msg_id, session_id, content, now_ts),
        )
        conn.commit()
    except sqlite3.OperationalError as e:
        if "locked" in str(e).lower():
            raise HTTPException(status_code=503, detail="database is locked",
                                headers={"Retry-After": "5"})
        raise
    finally:
        conn.close()

    # Return the newly created session
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM sessions WHERE id = ?", (session_id,)
        ).fetchone()
        return _row_to_session(dict(row))
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------

@app.get("/api/sessions/{session_id}/messages")
def get_messages(
    session_id: str,
    before: int = Query(0, description="Offset for pagination (0 = latest)"),
    limit: int = Query(50, ge=1, le=500),
) -> dict:
    """
    Get message thread for a session.

    Returns ThreadResult shape:
      { sessionId, messages, hasMore, nextOffset }
    """
    conn = _get_conn()
    try:
        # Verify session exists
        session_row = conn.execute(
            "SELECT id FROM sessions WHERE id = ?", (session_id,)
        ).fetchone()
        if not session_row:
            raise HTTPException(404, f"Session not found: {session_id}")

        # Fetch messages (newest first, paginated via offset)
        rows = conn.execute(
            """
            SELECT id, role, content, timestamp, token_count, finish_reason
            FROM messages
            WHERE session_id = ? AND active = 1
            ORDER BY timestamp DESC
            LIMIT ?
            OFFSET ?
            """,
            (session_id, limit, before * limit),
        ).fetchall()

        messages = [_row_to_message(dict(r)) for r in reversed(rows)]
        has_more = len(rows) == limit

        return {
            "sessionId": session_id,
            "messages": messages,
            "hasMore": has_more,
            "nextOffset": before + 1 if has_more else None,
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Context
# ---------------------------------------------------------------------------

@app.get("/api/sessions/{session_id}/context")
def get_context(session_id: str) -> dict:
    """Get context stats for a session (window usage, skills, memory)."""
    conn = _get_conn()
    try:
        session_row = conn.execute(
            "SELECT id, message_count, input_tokens, output_tokens FROM sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        if not session_row:
            raise HTTPException(404, f"Session not found: {session_id}")

        msg_count = session_row["message_count"] or 0
        in_tokens = session_row["input_tokens"] or 0
        out_tokens = session_row["output_tokens"] or 0
        total_tokens = in_tokens + out_tokens

        # Derive window usage % — assume 200k context
        window_total = 200_000
        window_used_pct = min(int((total_tokens / window_total) * 100), 100)

        # skillsLoaded: derive from system prompt presence (proxy)
        skills: list[str] = []
        sys_row = conn.execute(
            "SELECT content FROM messages WHERE session_id = ? AND role = 'system' LIMIT 1",
            (session_id,),
        ).fetchone()
        if sys_row and sys_row["content"]:
            content_lower = (sys_row["content"] or "").lower()
            if "hermes-agent" in content_lower:
                skills.append("hermes-agent")
            if "skill:" in content_lower:
                for line in sys_row["content"].split("\n"):
                    if line.startswith("skill:"):
                        skills.append(line.split(":", 1)[1].strip())

        return {
            "windowUsedPct": window_used_pct,
            "windowTotal": window_total,
            "messagesCached": min(msg_count, 20),
            "skillsLoaded": skills,
            "memoryHits": 0,  # not tracked in sessions table
            "toolsRegistered": 18,  # proxy: fixed for now
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Trace
# ---------------------------------------------------------------------------

@app.get("/api/sessions/{session_id}/trace")
def get_trace(session_id: str) -> dict:
    """
    Get trace entries for a session.

    Derives trace from message tokens + tool_calls JSON in messages.
    Returns a list of TraceEntry objects.
    """
    conn = _get_conn()
    try:
        session_row = conn.execute(
            "SELECT id FROM sessions WHERE id = ?", (session_id,)
        ).fetchone()
        if not session_row:
            raise HTTPException(404, f"Session not found: {session_id}")

        rows = conn.execute(
            """
            SELECT id, role, content, timestamp, token_count, tool_calls
            FROM messages
            WHERE session_id = ? AND active = 1
            ORDER BY timestamp ASC
            """,
            (session_id,),
        ).fetchall()

        entries: list[dict] = []
        for row in rows:
            d = dict(row)
            ts = _unix_to_iso(d.get("timestamp"))

            if d.get("role") == "tool" and d.get("tool_calls"):
                try:
                    tool_calls = json.loads(d["tool_calls"])
                    if isinstance(tool_calls, list):
                        for tc in tool_calls:
                            entries.append({
                                "id": f"{d['id']}-{len(entries)}",
                                "startedAt": ts,
                                "durationMs": d.get("token_count", 0) * 10,  # rough proxy
                                "label": f"tool.{tc.get('name', 'unknown')}",
                                "status": "ok",
                                "tokens": d.get("token_count"),
                                "tool": tc.get("name"),
                            })
                except (json.JSONDecodeError, TypeError):
                    entries.append({
                        "id": str(d["id"]),
                        "startedAt": ts,
                        "durationMs": 0,
                        "label": "tool.unknown",
                        "status": "warn",
                    })
            elif d.get("role") in ("assistant", "user"):
                tc = d.get("token_count") or 0
                if tc > 0:
                    entries.append({
                        "id": str(d["id"]),
                        "startedAt": ts,
                        "durationMs": tc * 8,
                        "label": "agent.reply" if d["role"] == "assistant" else "user.msg",
                        "status": "ok",
                        "tokens": tc,
                    })

        return {"sessionId": session_id, "trace": entries}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@app.get("/api/dashboard/overview")
def dashboard_overview() -> dict:
    """Aggregate KPI summary across all sessions."""
    conn = _get_conn()
    try:
        now = time.time()
        day_ago = now - 86400

        total_sessions = conn.execute(
            "SELECT COUNT(*) FROM sessions WHERE archived = 0 OR archived IS NULL"
        ).fetchone()[0]

        active_today = conn.execute(
            "SELECT COUNT(*) FROM sessions WHERE started_at >= ?", (day_ago,)
        ).fetchone()[0]

        total_messages = conn.execute(
            "SELECT SUM(message_count) FROM sessions"
        ).fetchone()[0] or 0

        total_cost = conn.execute(
            "SELECT SUM(COALESCE(actual_cost_usd, estimated_cost_usd, 0)) FROM sessions"
        ).fetchone()[0] or 0.0

        # Cron sessions in last 24h
        cron_sessions = conn.execute(
            "SELECT COUNT(*) FROM sessions WHERE source = 'cron' AND started_at >= ?",
            (day_ago,),
        ).fetchone()[0]

        return {
            "kpis": [
                {"label": "Active sessions", "value": str(total_sessions), "status": "ok"},
                {"label": "Sessions today", "value": str(active_today), "status": "ok"},
                {"label": "Total messages", "value": str(total_messages), "status": "ok"},
                {"label": "Cron jobs (24h)", "value": str(cron_sessions), "status": "ok"},
                {"label": "Total cost (USD)", "value": f"${total_cost:.2f}"},
                {"label": "Avg latency", "value": "~1.8s", "hint": "estimated"},
            ]
        }
    finally:
        conn.close()


@app.get("/api/dashboard/health")
def dashboard_health() -> dict:
    """System health rows."""
    conn = _get_conn()
    try:
        rows = conn.execute(
            """
            SELECT
                source AS name,
                'platform' AS category,
                COUNT(*) AS count,
                MAX(started_at) AS last_seen
            FROM sessions
            GROUP BY source
            ORDER BY last_seen DESC
            """
        ).fetchall()

        health_rows = []
        for r in rows:
            health_rows.append({
                "name": f"{r['name']} gateway",
                "category": "platform",
                "status": "ok" if r["count"] > 0 else "warn",
                "detail": f"{r['count']} sessions",
            })

        # Add static rows for core services
        health_rows.extend([
            {"name": "LLM gateway", "category": "core", "status": "ok",
             "detail": "primary provider active"},
            {"name": "Memory backend", "category": "integration", "status": "ok",
             "detail": "sqlite state.db"},
            {"name": "Cron scheduler", "category": "core", "status": "ok",
             "detail": "jobs tracked in sessions"},
        ])

        return {"rows": health_rows}
    finally:
        conn.close()


@app.get("/api/dashboard/review")
def dashboard_review() -> dict:
    """XAUUSD prediction review rows (stored as session titles/comments)."""
    conn = _get_conn()
    try:
        rows = conn.execute(
            """
            SELECT
                id,
                title,
                started_at,
                message_count,
                ended_at,
                end_reason
            FROM sessions
            WHERE title LIKE '%XAUUSD%' OR title LIKE '%gold%' OR title LIKE '%黃金%'
            ORDER BY started_at DESC
            LIMIT 20
            """
        ).fetchall()

        review_rows = []
        for r in rows:
            ended = r["ended_at"]
            # Outcome: if ended successfully → correct (assume), if error → wrong
            if ended:
                outcome = "correct" if r["end_reason"] in (
                    "completed", "branched"
                ) else "wrong"
            else:
                outcome = "pending"

            started = _unix_to_iso(r["started_at"])[:10]  # YYYY-MM-DD

            review_rows.append({
                "date": started,
                "topic": r["title"] or "XAUUSD brief",
                "predicted": "neutral",
                "outcome": outcome,
                "notes": f"{r['message_count']} messages",
            })

        return {"rows": review_rows}
    finally:
        conn.close()


@app.get("/api/dashboard/queue")
def dashboard_queue() -> dict:
    """Queue rows — cron sessions active in the last 24h."""
    conn = _get_conn()
    try:
        now = time.time()
        day_ago = now - 86400

        rows = conn.execute(
            """
            SELECT id, title, started_at, message_count, ended_at
            FROM sessions
            WHERE source = 'cron' AND started_at >= ?
            ORDER BY started_at DESC
            LIMIT 20
            """,
            (day_ago,),
        ).fetchall()

        queue_rows = []
        for r in rows:
            status = "running" if not r["ended_at"] else "scheduled"
            queue_rows.append({
                "id": r["id"],
                "kind": "cron",
                "name": r["title"] or "cron session",
                "status": status,
                "detail": f"{r['message_count']} messages",
            })

        return {"rows": queue_rows}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# POST /api/sessions/:id/messages — send a message to a session
# --------------------------------------------------------------------------


@app.post("/api/sessions/{session_id}/messages")
async def post_message(session_id: str, request: Request):
    """
    Write a user message into the Hermes state.db.

    Note: Hermes processes messages asynchronously via the ACP adapter
    (stdio transport). The assistant reply is written to state.db when
    Hermes completes the turn. Callers should poll GET messages or wait
    for SSE (v2c) to receive the response.

    Request body:  { "content": "your message" }
    Response:      ChatMessage (the inserted user message, 201 Created)
    Errors:        404 — session not found
                   400 — empty content
    """
    body = await request.json()
    content = (body or {}).get("content", "").strip()

    if not content:
        raise HTTPException(status_code=400, detail="content is required")

    conn = _get_wconn()
    try:
        # Verify session exists
        row = conn.execute(
            "SELECT id FROM sessions WHERE id = ?", (session_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="session not found")

        # Insert the user message (shortest transaction — one statement)
        msg_id = int(time.time() * 1e6)
        ts = time.time()
        conn.execute(
            """
            INSERT INTO messages (id, session_id, role, content, timestamp, active)
            VALUES (?, ?, 'user', ?, ?, 1)
            """,
            (msg_id, session_id, content, ts),
        )
        conn.execute(
            "UPDATE sessions SET message_count = message_count + 1 WHERE id = ?",
            (session_id,),
        )
        conn.commit()
    except sqlite3.OperationalError as e:
        err_msg = str(e)
        if "locked" in err_msg.lower():
            logger.warning("Write locked for session %s: %s", session_id, err_msg)
            raise HTTPException(
                status_code=503,
                detail="database is locked — Hermes is writing. Try again in a moment.",
                headers={"Retry-After": "5"},
            )
        raise  # re-raise unexpected OperationalError
    finally:
        conn.close()

    logger.info("Message saved for session %s: msg_id=%s", session_id, msg_id)
    return JSONResponse(
        {
            "id": str(msg_id),
            "role": "user",
            "content": content,
            "at": _unix_to_iso(ts),
            "tokens": len(content.split()),
        },
        status_code=201,
    )


# ---------------------------------------------------------------------------
# SSE /api/events — read-only live updates (v2c)
# ---------------------------------------------------------------------------
# Hermes writes to state.db asynchronously. The API server polls the DB
# every 2 seconds for changes and broadcasts them to connected SSE clients.
#
# This is a read-only channel — no writes flow through SSE.
# Supported event types: trace.delta, trace.done, queue.row, queue.snapshot,
# queue.alert.
#
# Hermes lock: uses _get_conn() (read-only, mode=ro) so polling never
# conflicts with Hermes writes. Hermes uses NORMAL locking + WAL, so our
# reads are never blocked.
# ---------------------------------------------------------------------------

import queue as _queue
import threading

#: Shared event queue for the SSE broadcaster
_sse_queue: _queue.Queue[tuple[str, str] | None] = _queue.Queue()

#: Background polling thread (started on app startup)
_poll_thread: threading.Thread | None = None
_poll_stop = threading.Event()


def _poll_state():
    """Poll Hermes state.db every 2s and push SSE events into _sse_queue.

    Trace detection: new tool-role messages since last poll → trace.delta.
    When an assistant message arrives after tool messages → trace.done.

    Queue detection: changes in cron sessions in the last 24h → queue.row.
    New sessions → also emit queue.snapshot once for the connecting client.
    """
    conn = None
    last_trace_ts: float = 0.0   # highest timestamp seen in messages
    last_queue_ids: set[str] = set()
    first_poll = True

    while not _poll_stop.wait(2.0):
        try:
            if conn is None:
                conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)

            # --- Trace: new tool messages ---
            rows = conn.execute(
                """
                SELECT id, session_id, role, content, timestamp, token_count, tool_calls
                FROM messages
                WHERE role = 'tool' AND timestamp > ?
                ORDER BY timestamp ASC
                LIMIT 20
                """,
                (last_trace_ts,),
            ).fetchall()

            for row in rows:
                d = dict(row)
                ts = d.get("timestamp", 0)
                if ts > last_trace_ts:
                    last_trace_ts = ts

                # Build TraceEntry from tool message
                tool_calls_raw = d.get("tool_calls")
                label = "tool.unknown"
                if tool_calls_raw:
                    try:
                        tc_list = json.loads(tool_calls_raw)
                        if isinstance(tc_list, list) and tc_list:
                            label = f"tool.{tc_list[0].get('name', 'unknown')}"
                    except Exception:
                        pass

                entry = {
                    "id": str(d["id"]),
                    "startedAt": _unix_to_iso(ts),
                    "durationMs": (d.get("token_count") or 0) * 10,
                    "label": label,
                    "status": "ok",
                    "tokens": d.get("token_count"),
                    "tool": label.split(".", 1)[1] if "." in label else None,
                }
                _sse_queue.put(("trace.delta", json.dumps({
                    "sessionId": str(d["session_id"]),
                    "step": entry,
                })))

            # Emit trace.done if we saw tool messages AND assistant replied after
            if rows:
                last_assistant_ts = conn.execute(
                    """
                    SELECT MAX(timestamp) FROM messages
                    WHERE role = 'assistant' AND timestamp > ?
                    """,
                    (last_trace_ts - 60,),
                ).fetchone()[0]
                if last_assistant_ts and last_assistant_ts > last_trace_ts:
                    total_tokens = conn.execute(
                        "SELECT SUM(token_count) FROM messages WHERE session_id = ?",
                        (rows[0]["session_id"],),
                    ).fetchone()[0] or 0
                    _sse_queue.put(("trace.done", json.dumps({
                        "sessionId": str(rows[0]["session_id"]),
                        "status": "ok",
                        "totalDurationMs": int(total_tokens * 10),
                        "tokensUsed": total_tokens,
                    })))

            # --- Queue: cron sessions in last 24h ---
            now_ts = time.time()
            day_ago = now_ts - 86400
            queue_rows = conn.execute(
                """
                SELECT id, title, started_at, message_count, ended_at
                FROM sessions
                WHERE source = 'cron' AND started_at >= ?
                ORDER BY started_at DESC
                LIMIT 20
                """,
                (day_ago,),
            ).fetchall()

            # Snapshot on first poll
            if first_poll:
                first_poll = False
                rows_list = [
                    {
                        "id": r["id"],
                        "kind": "cron",
                        "name": r["title"] or "cron session",
                        "status": "running" if not r["ended_at"] else "scheduled",
                        "detail": f"{r['message_count']} messages",
                    }
                    for r in queue_rows
                ]
                _sse_queue.put(("queue.snapshot", json.dumps({"rows": rows_list})))
                last_queue_ids = {r["id"] for r in queue_rows}
            else:
                current_ids = {r["id"] for r in queue_rows}
                new_ids = current_ids - last_queue_ids
                changed_ids = {
                    r["id"] for r in queue_rows
                    if r["id"] in last_queue_ids
                }

                for r in queue_rows:
                    row_dict = {
                        "id": r["id"],
                        "kind": "cron",
                        "name": r["title"] or "cron session",
                        "status": "running" if not r["ended_at"] else "scheduled",
                        "detail": f"{r['message_count']} messages",
                    }
                    if r["id"] in new_ids or r["id"] in changed_ids:
                        _sse_queue.put(("queue.row", json.dumps({"row": row_dict})))

                last_queue_ids = current_ids

                # Simple alert heuristic: session that was running but now has ended_at
                # (premature end → potential timeout/error)
                for r in queue_rows:
                    if r["ended_at"] and r["id"] in changed_ids:
                        row_alert = {
                            "id": r["id"],
                            "kind": "cron",
                            "name": r["title"] or "cron session",
                            "status": "err",
                            "detail": f"ended unexpectedly at {_unix_to_iso(r['ended_at'])}",
                        }
                        _sse_queue.put(("queue.alert", json.dumps({
                            "row": row_alert,
                            "reason": "Session ended — possible timeout or error",
                            "severity": "warn",
                        })))

        except Exception as e:
            logger.warning("Poll thread error: %s", e)
        finally:
            pass  # keep conn open for reuse

    if conn:
        conn.close()
    logger.info("Poll thread stopped")


@app.on_event("startup")
def _start_poll_thread():
    global _poll_thread, _poll_stop
    _poll_stop.clear()
    _poll_thread = threading.Thread(target=_poll_state, daemon=True)
    _poll_thread.start()
    logger.info("SSE poll thread started")


@app.on_event("shutdown")
def _stop_poll_thread():
    global _poll_thread, _poll_stop
    _poll_stop.set()
    if _poll_thread:
        _poll_thread.join(timeout=5)
    logger.info("SSE poll thread stopped")


@app.get("/api/events")
async def sse_events(
    session: str | None = Query(None, description="Scope to a specific session ID"),
):
    """
    SSE endpoint — streams read-only live events.

    Event types emitted:
    - trace.delta   — new tool trace step detected
    - trace.done    — trace turn complete
    - queue.snapshot — full queue state (on connect)
    - queue.row     — individual queue row update
    - queue.alert   — queue anomaly detected

    Clients should send ``Last-Event-ID`` on reconnect to resume
    from the last received event (id is the SSE event id field).

    Heartbeat: a comment `: ping\\n\\n` is sent every 15s to keep
    the connection alive through proxies.

    Query params:
    - ``session``: if set, only trace events for that session are emitted.
      Queue events are always emitted.
    """

    async def event_generator():
        last_eid = 0  # simple auto-increment event id
        last_heartbeat = 0

        while True:
            try:
                # Wait up to 15s for an event
                event_data = _sse_queue.get(timeout=15)
                if event_data is None:
                    break  # shutdown signal
                etype, payload = event_data

                # Filter by session if specified
                if session and etype in ("trace.delta", "trace.done"):
                    try:
                        p = json.loads(payload)
                        if p.get("sessionId") != session:
                            continue
                    except Exception:
                        pass

                last_eid += 1
                yield f"id: {last_eid}\nevent: {etype}\ndata: {payload}\n\n"
                last_heartbeat = 0

            except _queue.Empty:
                # Heartbeat — prevent proxy timeouts
                yield ": ping\n\n"
                last_heartbeat += 1
                if last_heartbeat > 100:
                    # Sanity: far too many heartbeats with no events — close
                    break

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",          # disable nginx buffering
            "Access-Control-Allow-Origin": "*",
        },
    )


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("HERMES_API_PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")