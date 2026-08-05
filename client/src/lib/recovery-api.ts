import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiJson } from './api-client';

/**
 * There is no mail transport in this project. Outside production the server
 * echoes the minted token so the flow can be walked end to end; in production
 * the field is simply absent. The UI must therefore treat it as optional and
 * never build a screen that only works when it is present.
 */
export type DevTokenHint = { devToken?: string };

export type ForgotPasswordResult = { message: string };
export type ResetPasswordResult = { message: string };
export type VerificationRequestResult = DevTokenHint & {
  alreadyVerified: boolean;
};
export type ConfirmEmailResult = { emailVerified: boolean };

const jsonPost = <T>(path: string, body: unknown): Promise<T> =>
  apiJson<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export const requestPasswordReset = (email: string) =>
  jsonPost<ForgotPasswordResult>('/api/auth/forgot-password', { email });

export const resetPassword = (input: { token: string; newPassword: string }) =>
  jsonPost<ResetPasswordResult>('/api/auth/reset-password', input);

export const requestEmailVerification = () =>
  jsonPost<VerificationRequestResult>('/api/auth/verify-email/request', {});

export const confirmEmailVerification = (token: string) =>
  jsonPost<ConfirmEmailResult>('/api/auth/verify-email/confirm', { token });

export function useRequestPasswordReset() {
  return useMutation({ mutationFn: requestPasswordReset });
}

export function useResetPassword() {
  return useMutation({ mutationFn: resetPassword });
}

export function useRequestEmailVerification() {
  return useMutation({ mutationFn: requestEmailVerification });
}

export function useConfirmEmailVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: confirmEmailVerification,
    // `emailVerified` is read from the row on every request rather than from
    // the JWT, so the banner clears on the next fetch of /auth/me — no
    // re-login, and no stale claim to work around.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  });
}

/** Unwraps the server's message; falls back to a generic Vietnamese line. */
export function recoveryError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  try {
    const body = JSON.parse(error.message) as { message?: string | string[] };
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message;
    return message ?? fallback;
  } catch {
    return error.message || fallback;
  }
}
