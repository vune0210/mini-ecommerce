import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * A saved delivery destination. Deliberately a separate table from the address
 * columns on `orders`: an order snapshots where it actually shipped, so editing
 * or deleting the book entry must never rewrite delivery history.
 */
@Entity({ name: 'addresses' })
@Index('IDX_addresses_user_default', ['userId', 'isDefault'])
export class Address {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  /** Free-text nickname such as "Home" or "Office". */
  @Column({ type: 'varchar', length: 50, nullable: true })
  label: string | null;

  @Column({ name: 'recipient_name', type: 'varchar', length: 100 })
  recipientName: string;

  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ name: 'address_line', type: 'varchar', length: 255 })
  addressLine: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ward: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  district: string | null;

  @Column({ type: 'varchar', length: 100 })
  city: string;

  /** At most one per user; the service enforces that inside a transaction. */
  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
