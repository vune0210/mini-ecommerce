export type UserRole = 'ADMIN' | 'CUSTOMER';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /**
   * Read from the row on every request rather than carried in the JWT, so it
   * flips as soon as the verification link is clicked — no re-login needed.
   * Optional because tokens minted before verification existed omit it.
   */
  emailVerified?: boolean;
};

/**
 * `GET /api/auth/sessions`. Never carries the token hash — that column does not
 * leave the server, even to the session's own owner.
 */
export type UserSession = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  /** True for the session the access token in use was minted from. */
  current: boolean;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};
