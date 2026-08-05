import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../../users/entities/user.entity';

export enum IdempotencyState {
  /** Claimed, handler still running. A concurrent duplicate must wait, not run. */
  IN_FLIGHT = 'IN_FLIGHT',
  COMPLETED = 'COMPLETED',
}

/**
 * One row per (caller, operation, key). The unique index is the whole
 * mechanism: claiming a key is an INSERT that either succeeds or collides, so
 * two simultaneous submissions of the same checkout cannot both proceed.
 *
 * Scoped per user rather than globally — a key is a client-chosen string, and
 * one customer must never be able to collide with, or read back, another
 * customer's stored response by guessing it.
 */
@Entity({ name: 'idempotency_keys' })
@Index(
  'UQ_idempotency_keys_user_scope_key',
  ['userId', 'scope', 'idempotencyKey'],
  { unique: true },
)
@Index('IDX_idempotency_keys_expires_at', ['expiresAt'])
export class IdempotencyKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  /** The operation the key belongs to, e.g. `orders.checkout`. */
  @Column({ type: 'varchar', length: 60 })
  scope: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 128 })
  idempotencyKey: string;

  /**
   * SHA-256 of the canonicalized request payload. Replaying a key with a
   * *different* body is a client bug, not a retry, and returning the first
   * response would silently discard the second order.
   */
  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash: string;

  @Column({ type: 'enum', enum: IdempotencyState })
  state: IdempotencyState;

  @Column({
    name: 'response_status',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  responseStatus: number | null;

  /**
   * The successful response, replayed verbatim on a retry. Stored as JSON, so
   * Dates arrive as the same ISO strings the original HTTP response carried —
   * a replay must be indistinguishable from the first answer.
   */
  @Column({ name: 'response_body', type: 'json', nullable: true })
  responseBody: Record<string, unknown> | null;

  @Column({ name: 'expires_at', type: 'datetime', precision: 6 })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
