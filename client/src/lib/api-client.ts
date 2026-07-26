import { useAuthStore } from '../stores/auth-store';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

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

  const refreshResponse = await fetch(`${apiBaseUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });

  if (!refreshResponse.ok) {
    useAuthStore.getState().clearAuth();
    return response;
  }

  const { accessToken } = (await refreshResponse.json()) as { accessToken: string };
  useAuthStore.getState().setAccessToken(accessToken);
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
