/**
 * Auth API client for hermes-web-ui
 *
 * Handles login, registration, token refresh, and user state.
 * Tokens stored in localStorage.
 *
 * Mode detection:
 *   VITE_API_BASE_URL unset/empty → mock mode (dev without backend)
 *   VITE_API_BASE_URL set         → real FastAPI server
 */

export const AUTH_TOKEN_KEY='hermes-web-ui.access-token';
export const AUTH_REFRESH_KEY='hermes-web-ui.refresh-token';
export const AUTH_USER_KEY='hermes-web-ui.user';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number;
  username: string;
  created_at?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface UserResponse {
  id: number;
  username: string;
  created_at?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) return ''; // mock mode
  return base.replace(/\/$/, '');
}

function getHeaders(auth = true): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (auth) {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return headers;
}

// ─── Mock mode (dev without backend) ─────────────────────────────────────────

const MOCK_USER: AuthUser = { id: 1, username: 'admin' };

function mockLogin(_username: string, password: string): Promise<TokenResponse> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (password === 'admin123') {
        const tokens: TokenResponse = {
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          token_type: 'bearer',
        };
        localStorage.setItem(AUTH_TOKEN_KEY, tokens.access_token);
        localStorage.setItem(AUTH_REFRESH_KEY, tokens.refresh_token);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(MOCK_USER));
        resolve(tokens);
      } else {
        reject(new Error('Invalid username or password'));
      }
    }, 300);
  });
}

function mockRegister(_username: string, _password: string): Promise<AuthUser> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(MOCK_USER);
    }, 300);
  });
}

function mockLogout(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_REFRESH_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

// ─── Real API calls ───────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const base = getBaseUrl();
  if (!base) throw new Error('No API base URL configured');

  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      ...getHeaders(false),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─── Public API ────────────────────────────────────────────────────────────────

export function isMockMode(): boolean {
  return !import.meta.env.VITE_API_BASE_URL;
}

export async function login(username: string, password: string): Promise<void> {
  if (isMockMode()) {
    await mockLogin(username, password);
    return;
  }

  const tokens = await apiFetch<TokenResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

  localStorage.setItem(AUTH_TOKEN_KEY, tokens.access_token);
  localStorage.setItem(AUTH_REFRESH_KEY, tokens.refresh_token);

  // Fetch user info
  const user = await apiFetch<AuthUser>('/auth/me', {
    headers: getHeaders(true),
  });
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export async function register(username: string, email: string, password: string): Promise<AuthUser> {
  if (isMockMode()) {
    return mockRegister(username, password);
  }

  const user = await apiFetch<AuthUser>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  });

  return user;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (isMockMode()) {
    const stored = localStorage.getItem(AUTH_USER_KEY);
    return stored ? JSON.parse(stored) : null;
  }

  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) return null;

  try {
    const user = await apiFetch<AuthUser>('/auth/me', {
      headers: getHeaders(true),
    });
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    return user;
  } catch {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_REFRESH_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    return null;
  }
}

export async function refreshTokens(): Promise<boolean> {
  const refresh = localStorage.getItem(AUTH_REFRESH_KEY);
  if (!refresh) return false;

  if (isMockMode()) return true;

  try {
    const tokens = await apiFetch<TokenResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refresh }),
    });
    localStorage.setItem(AUTH_TOKEN_KEY, tokens.access_token);
    localStorage.setItem(AUTH_REFRESH_KEY, tokens.refresh_token);
    return true;
  } catch {
    logout();
    return false;
  }
}

export function logout(): void {
  if (!isMockMode()) {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      // Fire-and-forget logout call
      const base = getBaseUrl();
      if (base) {
        fetch(`${base}/auth/logout`, {
          method: 'POST',
          headers: getHeaders(true),
        }).catch(() => {});
      }
    }
  }
  mockLogout();
}

export function isAuthenticated(): boolean {
  if (isMockMode()) {
    return !!localStorage.getItem(AUTH_TOKEN_KEY);
  }
  return !!localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  const stored = localStorage.getItem(AUTH_USER_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}