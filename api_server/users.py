"""
User management and authentication storage for Hermes API.

Manages users table in the Hermes state.db for JWT authentication.
"""

from __future__ import annotations

import sqlite3
import uuid
from pathlib import Path
from typing import Optional

from .auth import hash_password, verify_password

# Use the same DB path logic as main.py
import os
from pathlib import Path as _Path

_DB_PATH = os.environ.get("HERMES_STATE_DB", "")
if not _DB_PATH:
    _hermes_home = _Path.home() / ".hermes"
    _env_home = os.environ.get("HERMES_HOME", "")
    if _env_home:
        _hermes_home = _Path(_env_home)
    _DB_PATH = str(_hermes_home / "state.db")


def _get_auth_conn() -> sqlite3.Connection:
    """Open a read/write connection to state.db for auth operations."""
    conn = sqlite3.connect(f"file:{_DB_PATH}?mode=rwc", uri=True)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def _ensure_users_table():
    """Create the users table if it doesn't exist."""
    conn = _get_auth_conn()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                hashed_password TEXT NOT NULL,
                is_active INTEGER DEFAULT 1,
                is_admin INTEGER DEFAULT 0,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
        """)
        conn.commit()
    finally:
        conn.close()


def create_user(username: str, email: str, password: str) -> dict:
    """
    Create a new user.
    Returns the user dict (without password) or raises ValueError on conflict.
    """
    _ensure_users_table()
    
    user_id = str(uuid.uuid4())
    hashed = hash_password(password)
    now = datetime.now().timestamp()
    
    conn = _get_auth_conn()
    try:
        conn.execute("""
            INSERT INTO users (id, username, email, hashed_password, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, ?, ?)
        """, (user_id, username, email, hashed, now, now))
        conn.commit()
    except sqlite3.IntegrityError as e:
        if "username" in str(e):
            raise ValueError("Username already exists")
        elif "email" in str(e):
            raise ValueError("Email already exists")
        raise ValueError(str(e))
    finally:
        conn.close()
    
    return {
        "id": user_id,
        "username": username,
        "email": email,
        "is_active": True,
        "is_admin": False,
    }


def get_user_by_username(username: str) -> Optional[dict]:
    """Get a user by username. Returns None if not found."""
    _ensure_users_table()
    
    conn = _get_auth_conn()
    try:
        row = conn.execute(
            "SELECT * FROM users WHERE username = ? AND is_active = 1",
            (username,)
        ).fetchone()
        if row:
            return dict(row)
        return None
    finally:
        conn.close()


def get_user_by_id(user_id: str) -> Optional[dict]:
    """Get a user by ID. Returns None if not found."""
    _ensure_users_table()
    
    conn = _get_auth_conn()
    try:
        row = conn.execute(
            "SELECT * FROM users WHERE id = ? AND is_active = 1",
            (user_id,)
        ).fetchone()
        if row:
            return dict(row)
        return None
    finally:
        conn.close()


def authenticate_user(username: str, password: str) -> Optional[dict]:
    """
    Authenticate a user by username and password.
    Returns the user dict (without password) if valid, None otherwise.
    """
    user = get_user_by_username(username)
    if not user:
        return None
    if not verify_password(password, user["hashed_password"]):
        return None
    # Return user info without sensitive data
    return {
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "is_active": bool(user["is_active"]),
        "is_admin": bool(user["is_admin"]),
    }


def user_exists(username: str = None, email: str = None) -> bool:
    """Check if a user with given username or email already exists."""
    _ensure_users_table()
    
    conn = _get_auth_conn()
    try:
        if username:
            row = conn.execute(
                "SELECT 1 FROM users WHERE username = ?",
                (username,)
            ).fetchone()
            if row:
                return True
        if email:
            row = conn.execute(
                "SELECT 1 FROM users WHERE email = ?",
                (email,)
            ).fetchone()
            if row:
                return True
        return False
    finally:
        conn.close()


# Import datetime at module level for create_user
from datetime import datetime