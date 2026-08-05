import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthTokens, AuthUser } from '../types/auth';

type AuthState = {
  user: AuthUser | null;
  tokens: AuthTokens | null;
  setAuth: (user: AuthUser, tokens: AuthTokens) => void;
  /** Replaces the whole pair — /auth/refresh rotates the refresh token too. */
  setTokens: (tokens: AuthTokens) => void;
  setAccessToken: (accessToken: string) => void;
  clearAuth: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      setAuth: (user, tokens) => set({ user, tokens }),
      setTokens: (tokens) => set({ tokens }),
      setAccessToken: (accessToken) =>
        set((state) => ({
          tokens: state.tokens ? { ...state.tokens, accessToken } : null,
        })),
      clearAuth: () => set({ user: null, tokens: null }),
    }),
    { name: 'mini-ecommerce-auth' },
  ),
);
