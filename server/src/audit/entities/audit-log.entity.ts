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
 * Append-only record of every state-changing action an admin performed. The
 * application tables answer "what does this product look like now"; only this
 * one answers "who unpublished it, when, and from where" — the question asked
 * after the change is already in place and nobody admits to making it.
 *
 * Actor identity is stored twice on purpose: `actor_user_id` for joins while the
 * account exists, and the `actor_email` / `actor_role` snapshots so the row is
 * still readable after the staff account is deleted. The FK is ON DELETE SET
 * NULL — removing an employee must never erase the evidence that they acted.
 */
// Index names match AddAuditLog so migration:generate does not propose dropping
// and recreating them.
@Entity({ name: 'audit_log' })
@Index('IDX_audit_log_actor_created_at', ['actorUserId', 'createdAt'])
@Index('IDX_audit_log_resource', ['resourceType', 'resourceId'])
@Index('IDX_audit_log_created_at', ['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_user_id' })
  actorUser: User | null;

  @Column({
    name: 'actor_user_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  actorUserId: string | null;

  /** Snapshot: survives the actor row being deleted, which nulls the FK. */
  @Column({ name: 'actor_email', type: 'varchar', length: 255 })
  actorEmail: string;

  /** Snapshot of the role held at write time, not the role held today. */
  @Column({ name: 'actor_role', type: 'varchar', length: 20 })
  actorRole: string;

  /** Route-derived, e.g. `product.update`, `user.role.change`. See audit-rules. */
  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Column({ type: 'varchar', length: 10 })
  method: string;

  @Column({ type: 'varchar', length: 512 })
  path: string;

  @Column({
    name: 'resource_type',
    type: 'varchar',
    length: 60,
    nullable: true,
  })
  resourceType: string | null;

  @Column({ name: 'resource_id', type: 'varchar', length: 36, nullable: true })
  resourceId: string | null;

  @Column({ name: 'status_code', type: 'int', unsigned: true })
  statusCode: number;

  /** Correlates the row with the access log line for the same request. */
  @Column({ name: 'request_id', type: 'varchar', length: 64, nullable: true })
  requestId: string | null;

  /**
   * An allow-listed handful of scalars from the request body — never the body
   * itself. `auditMetadata` decides what may land here.
   */
  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
