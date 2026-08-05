import { useAuthStore } from '../stores/auth-store';
import type { AuthTokens } from '../types/auth';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

/**
 * The API rotates refresh tokens: every call to /auth/refresh retires the token
 * it was given and returns a replacement. Two requests that 401 at the same
 * moment would therefore each present the same token, and the loser would look
 * like a replay — which the server answers by revoking the whole session
 * family. Sharing one in-flight refresh removes that race entirely, instead of
 * relying on the server's rotation grace window to forgive it.
 */
let inFlightRefresh: Promise<AuthTokens | null> | null = null;

function refreshTokens(refreshToken: string): Promise<AuthTokens | null> {
  inFlightRefresh ??= (async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) {
        useAuthStore.getState().clearAuth();
        return null;
      }
      const tokens = (await response.json()) as AuthTokens;
      // Both halves must be stored: keeping the old refresh token would leave
      // the session dead the moment the grace window closes.
      useAuthStore.getState().setTokens(tokens);
      return tokens;
    } finally {
      inFlightRefresh = null;
    }
  })();
  return inFlightRefresh;
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  retryAfterRefresh = true,
): Promise<Response> {
  const { tokens } = useAuthStore.getState();
  const headers = new Headers(init.headers);

  if (tokens?.accessToken) headers.set('Authorization', `Bearer ${tokens.accessToken}`);

  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  if (response.status !== 401 || !retryAfterRefresh || !tokens?.refreshToken) return response;

  const refreshed = await refreshTokens(tokens.refreshToken);
  if (!refreshed) return response;
  return apiFetch(path, init, false);
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) throw new Error((await response.text()) || `Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

/** For endpoints that answer 204 No Content — parsing an empty body would throw. */
export async function apiVoid(path: string, init?: RequestInit): Promise<void> {
  const response = await apiFetch(path, init);
  if (!response.ok) throw new Error((await response.text()) || `Request failed: ${response.status}`);
}
