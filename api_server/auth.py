"""
JWT Authentication utilities for Hermes API.

Provides token creation, verification, and password hashing.
Run:
    python -m uvicorn api_server.main:app --port 8080 --reload
"""

from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

# -----------------------------------------------------------------------------
# Logger (defined before config so we can log at import time)
# -----------------------------------------------------------------------------
_log = logging.getLogger("hermes-auth")

# -----------------------------------------------------------------------------
# Config
# -----------------------------------------------------------------------------

# JWT Settings - MUST be set via environment variable in production
# In dev, a random key is used (tokens are not persisted across restarts)
_jwt_secret_env = os.environ.get("JWT_SECRET", "")
if not _jwt_secret_env:
    if os.environ.get("HERMES_ENV") == "production":
        raise RuntimeError("JWT_SECRET env var is required in production mode")
    JWT_SECRET_KEY = secrets.token_urlsafe(32)
    _log.warning(
        "JWT_SECRET not set — using auto-generated key. "
        "Tokens will be INVALID after restart. "
        "Set HERMES_ENV=production to enforce fixed secret."
    )
else:
    JWT_SECRET_KEY = _jwt_secret_env
    _log.info("JWT_SECRET loaded from environment.")
JWT_ALGORITHM = "HS256"
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("HERMES_JWT_EXPIRE_MINUTES", "60"))
JWT_REFRESH_TOKEN_EXPIRE_DAYS = int(os.environ.get("HERMES_JWT_REFRESH_EXPIRE_DAYS", "7"))

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# HTTP Bearer scheme for Swagger UI
bearer_scheme = HTTPBearer(auto_error=False)


# -----------------------------------------------------------------------------
# Password utilities
# -----------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash."""
    return pwd_context.verify(plain_password, hashed_password)


# -----------------------------------------------------------------------------
# Token creation
# -----------------------------------------------------------------------------

def create_access_token(
    subject: str,
    expires_delta: Optional[timedelta] = None,
    extra_claims: Optional[dict] = None,
) -> str:
    """Create a new JWT access token."""
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "type": "access",
    }
    if extra_claims:
        to_encode.update(extra_claims)
    
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt


def create_refresh_token(
    subject: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a new JWT refresh token."""
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=JWT_REFRESH_TOKEN_EXPIRE_DAYS)
    
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "type": "refresh",
    }
    
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt


def create_tokens(subject: str, extra_claims: Optional[dict] = None) -> dict:
    """Create both access and refresh tokens."""
    access_token = create_access_token(subject, extra_claims=extra_claims)
    refresh_token = create_refresh_token(subject)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


# -----------------------------------------------------------------------------
# Token verification
# -----------------------------------------------------------------------------

def decode_token(token: str) -> dict:
    """Decode and verify a JWT token. Returns the payload."""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def verify_access_token(token: str) -> dict:
    """Verify an access token and return its payload."""
    payload = decode_token(token)
    token_type = payload.get("type")
    if token_type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type - expected access token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def verify_refresh_token(token: str) -> dict:
    """Verify a refresh token and return its payload."""
    payload = decode_token(token)
    token_type = payload.get("type")
    if token_type != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type - expected refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


# -----------------------------------------------------------------------------
# FastAPI Dependencies
# -----------------------------------------------------------------------------

async def get_current_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> str:
    """
    FastAPI dependency to get the current user's ID from a JWT access token.
    Raises 401 if missing or invalid.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    payload = verify_access_token(credentials.credentials)
    subject = payload.get("sub")
    if subject is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return subject


async def get_optional_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Optional[str]:
    """
    FastAPI dependency to get the current user's ID if authenticated, None otherwise.
    Does NOT raise - useful for optional auth on public endpoints.
    """
    if credentials is None:
        return None
    
    try:
        payload = verify_access_token(credentials.credentials)
        return payload.get("sub")
    except HTTPException:
        return None