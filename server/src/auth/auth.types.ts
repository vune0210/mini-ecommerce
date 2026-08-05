import { UserRole } from '../users/entities/user.entity';

export type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
  type: 'access' | 'refresh';
  /** Refresh tokens only: the refresh_sessions row this token names. */
  jti?: string;
  /** Refresh tokens only: the rotation chain the session belongs to. */
  fam?: string;
  /** Access tokens only: the session the token was minted from. */
  sid?: string;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /**
   * Derived from `email_verified_at`, never carried in the JWT: verification
   * status changes mid-token-lifetime and a stale claim would keep telling the
   * client to nag a customer who has already clicked the link.
   */
  emailVerified: boolean;
  /**
   * Null for access tokens issued before sessions existed. Everything that
   * reads it must tolerate that rather than assume a session is always known.
   */
  sessionId?: string | null;
};

/** What a session row records about where a login came from. */
export type RequestOrigin = {
  userAgent: string | null;
  ipAddress: string | null;
};
