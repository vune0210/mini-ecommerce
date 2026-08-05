import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth-store';
import type { Address, AddressInput, ChangePasswordInput, ProfileInput, UpdateAddressInput } from '../types/account';
import type { AuthTokens, AuthUser, UserSession } from '../types/auth';
import { apiJson, apiVoid } from './api-client';

const meKey = ['me'] as const; const sessionsKey = ['sessions'] as const; const addressesKey = ['addresses'] as const;
const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export const getMe = () => apiJson<AuthUser>('/api/auth/me');
export const updateProfile = (input: ProfileInput) => apiJson<AuthUser>('/api/auth/profile', { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ name: input.name }) });
/** Returns a REPLACEMENT token pair: the change revoked every session, this one included. */
export const changePassword = (input: ChangePasswordInput) => apiJson<AuthTokens>('/api/auth/password', { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(input) });
export const getSessions = () => apiJson<UserSession[]>('/api/auth/sessions');
export const revokeSession = (id: string) => apiVoid(`/api/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const logoutAll = () => apiVoid('/api/auth/logout-all', { method: 'POST' });

export const getAddresses = () => apiJson<Address[]>('/api/addresses');
export const createAddress = (input: AddressInput) => apiJson<Address>('/api/addresses', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) });
// `id` must stay out of the body: the API runs forbidNonWhitelisted and rejects it.
export const updateAddress = ({ id, ...body }: UpdateAddressInput) => apiJson<Address>(`/api/addresses/${encodeURIComponent(id)}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body) });
export const deleteAddress = (id: string) => apiVoid(`/api/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const setDefaultAddress = (id: string) => apiJson<Address>(`/api/addresses/${encodeURIComponent(id)}/default`, { method: 'PATCH' });

function useLoggedIn() { return useAuthStore((state) => Boolean(state.user && state.tokens)); }
function useInvalidate(keys: ReadonlyArray<readonly unknown[]>) { const client = useQueryClient(); return () => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey }))); }
/** Keeps the persisted user in step with the API so the nav bar renames itself too. */
function storeUser(user: AuthUser): void { const { tokens, setAuth } = useAuthStore.getState(); if (tokens) setAuth(user, tokens); }

export function useMe() { const enabled = useLoggedIn(); return useQuery({ queryKey: meKey, queryFn: getMe, enabled }); }
export function useSessions() { const enabled = useLoggedIn(); return useQuery({ queryKey: sessionsKey, queryFn: getSessions, enabled }); }
export function useAddresses() { const enabled = useLoggedIn(); return useQuery({ queryKey: addressesKey, queryFn: getAddresses, enabled }); }

export function useUpdateProfile() { const invalidate = useInvalidate([meKey]); return useMutation({ mutationFn: updateProfile, onSuccess: async (user) => { storeUser(user); await invalidate(); } }); }
/**
 * Storing the returned pair is not optional: the server revoked every refresh
 * session including the caller's, so keeping the old tokens would log this tab
 * out at the next request.
 */
export function useChangePassword() { const invalidate = useInvalidate([sessionsKey]); return useMutation({ mutationFn: changePassword, onSuccess: async (tokens) => { useAuthStore.getState().setTokens(tokens); await invalidate(); } }); }
export function useRevokeSession() { const invalidate = useInvalidate([sessionsKey]); return useMutation({ mutationFn: revokeSession, onSuccess: invalidate }); }
export function useLogoutAll() { const invalidate = useInvalidate([sessionsKey]); return useMutation({ mutationFn: logoutAll, onSuccess: invalidate }); }
export function useCreateAddress() { const invalidate = useInvalidate([addressesKey]); return useMutation({ mutationFn: createAddress, onSuccess: invalidate }); }
export function useUpdateAddress() { const invalidate = useInvalidate([addressesKey]); return useMutation({ mutationFn: updateAddress, onSuccess: invalidate }); }
export function useDeleteAddress() { const invalidate = useInvalidate([addressesKey]); return useMutation({ mutationFn: deleteAddress, onSuccess: invalidate }); }
export function useSetDefaultAddress() { const invalidate = useInvalidate([addressesKey]); return useMutation({ mutationFn: setDefaultAddress, onSuccess: invalidate }); }

export function accountError(error: unknown): string { if (!(error instanceof Error)) return 'Thao tác không thành công.'; try { const body = JSON.parse(error.message) as { message?: string | string[] }; return Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Thao tác không thành công.'; } catch { return error.message; } }
