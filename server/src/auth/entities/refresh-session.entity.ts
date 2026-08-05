import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/** Why a session stopped being usable. 'rotated' is the only benign value. */
export enum SessionRevokeReason {
  ROTATED = 'rotated',
  LOGOUT = 'logout',
  LOGOUT_ALL = 'logout-all',
  PASSWORD_CHANGED = 'password-changed',
  REUSE_DETECTED = 'reuse-detected',
  ACCOUNT_DISABLED = 'account-disabled',
}

/**
 * One row per issued refresh token. The token itself is never stored — only its
 * SHA-256 — so a database leak cannot be replayed against the API.
 *
 * The primary key doubles as the token's `jti`, which is what makes rotation
 * cheap: a presented refresh token names its own row without a table scan.
 * `family_id` ties every rotation of one login together so a single detected
 * replay can revoke the whole chain rather than just the stolen leaf.
 */
// Index names match AddRefreshSessions so migration:generate does not propose
// dropping and recreating them.
@Entity({ name: 'refresh_sessions' })
@Index('UQ_refresh_sessions_token_hash', ['tokenHash'], { unique: true })
@Index('IDX_refresh_sessions_user_created_at', ['userId', 'createdAt'])
@Index('IDX_refresh_sessions_family', ['familyId'])
export class RefreshSession {
  /** Assigned by the service, not the database: it is minted into the JWT first. */
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  /** Shared by every token in one login's rotation chain. */
  @Column({ name: 'family_id', type: 'varchar', length: 36 })
  familyId: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'expires_at', type: 'datetime', precision: 6 })
  expiresAt: Date;

  @Column({
    name: 'revoked_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  revokedAt: Date | null;

  @Column({
    name: 'revoked_reason',
    type: 'enum',
    enum: SessionRevokeReason,
    nullable: true,
  })
  revokedReason: SessionRevokeReason | null;

  /** The session this one rotated into; lets an audit walk the chain forward. */
  @Column({
    name: 'replaced_by_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  replacedById: string | null;

  @Column({
    name: 'last_used_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  lastUsedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
