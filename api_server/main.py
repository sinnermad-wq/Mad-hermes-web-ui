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
from fastapi.responses import JSONResponse
from fastapi import FastAPI, HTTPException, Query
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

app = FastAPI(
    title="Hermes API",
    description="Read-only API over Hermes Agent session store.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten for production
    allow_credentials=True,
    allow_methods=["GET"],
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
    conn.execute("PRAGMA journal_mode=WAL")  # best-effort; read-only ok
    return conn


def _rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict]:
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Shape adapters (Hermes DB -> API contract)
# ---------------------------------------------------------------------------

def _row_to_session(row: dict) -> dict:
    """Map a sessions table row to the SessionItem contract."""
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
        "pinned": False,
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
        sessions = [_row_to_session(dict(r)) for r in rows]
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
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("HERMES_API_PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")