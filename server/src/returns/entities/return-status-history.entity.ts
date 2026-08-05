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
import { ReturnRequest, ReturnStatus } from './return-request.entity';

// Mirrors order_status_history: same creation marker, same actor snapshot, same
// ON DELETE rules. Index name matches AddReturnRequests so migration:generate
// does not propose dropping and recreating it.
@Entity({ name: 'return_status_history' })
@Index('IDX_return_status_history_request_created_at', [
  'returnRequestId',
  'createdAt',
])
export class ReturnStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ReturnRequest, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'return_request_id' })
  returnRequest: ReturnRequest;

  @Column({ name: 'return_request_id', type: 'varchar', length: 36 })
  returnRequestId: string;

  /** NULL marks the request-creation event rather than a status transition. */
  @Column({
    name: 'from_status',
    type: 'enum',
    enum: ReturnStatus,
    nullable: true,
  })
  fromStatus: ReturnStatus | null;

  @Column({ name: 'to_status', type: 'enum', enum: ReturnStatus })
  toStatus: ReturnStatus;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_user_id' })
  actorUser: User | null;

  @Column({
    name: 'actor_user_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  actorUserId: string | null;

  /** Role snapshot at write time; survives the actor row being deleted. */
  @Column({ name: 'actor_role', type: 'varchar', length: 20, nullable: true })
  actorRole: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
