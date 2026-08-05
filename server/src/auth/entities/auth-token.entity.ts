import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * What a token is allowed to do. Carried in the row and in every lookup, so a
 * verification link can never be redeemed as a password reset: those two have
 * very different blast radii and one must not be a stepping stone to the other.
 */
export enum AuthTokenPurpose {
  PASSWORD_RESET = 'password-reset',
  EMAIL_VERIFICATION = 'email-verification',
}

/**
 * One row per minted out-of-band token (reset links, verification links). Like
 * `refresh_sessions`, the secret itself is never stored — only its SHA-256 — so
 * a dump of this table cannot be replayed against the API. That is the whole
 * point of the design: these tokens are bearer credentials that arrive by
 * email, i.e. over a channel the server does not control.
 *
 * `consumed_at` is the single terminal marker. A token is spent either because
 * it was redeemed or because a newer request for the same purpose superseded
 * it; both must reject identically, so there is no reason for a second column
 * that a lookup would then have to remember to check.
 */
// Index names are spelled out so they match AddAuthTokens exactly and
// migration:generate does not propose dropping and recreating them.
@Entity({ name: 'auth_tokens' })
@Index('UQ_auth_tokens_token_hash', ['tokenHash'], { unique: true })
@Index('IDX_auth_tokens_user_purpose', ['userId', 'purpose'])
export class AuthToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @Column({ name: 'purpose', type: 'enum', enum: AuthTokenPurpose })
  purpose: AuthTokenPurpose;

  /** SHA-256 hex of the emailed secret. Never the secret. */
  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'datetime', precision: 6 })
  expiresAt: Date;

  /** Stamped on redemption *and* on supersession — see the class comment. */
  @Column({
    name: 'consumed_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  consumedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
