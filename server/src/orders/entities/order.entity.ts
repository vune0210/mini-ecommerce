import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { OrderItem } from './order-item.entity';

export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  SHIPPED = 'SHIPPED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

// Index names match AddOrderShippingDetails so migration:generate does not
// propose dropping and recreating them.
@Entity({ name: 'orders' })
@Index('UQ_orders_order_number', ['orderNumber'], { unique: true })
@Index('IDX_orders_status_created_at', ['status', 'createdAt'])
export class Order {
  @PrimaryGeneratedColumn('uuid') id: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;
  @OneToMany(() => OrderItem, (item) => item.order) items: OrderItem[];
  @Column({ name: 'order_number', type: 'varchar', length: 24 })
  orderNumber: string;
  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;
  @Column({ name: 'total_amount', type: 'decimal', precision: 10, scale: 2 })
  totalAmount: string;
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
  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
