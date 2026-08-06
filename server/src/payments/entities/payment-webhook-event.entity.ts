import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum WebhookEventStatus {
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
}

@Entity({ name: 'payment_webhook_events' })
@Index('UQ_payment_webhooks_provider_event', ['provider', 'externalEventId'], {
  unique: true,
})
export class PaymentWebhookEvent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 32 }) provider: string;
  @Column({ name: 'external_event_id', type: 'varchar', length: 128 })
  externalEventId: string;
  @Column({ name: 'payload_hash', type: 'char', length: 64 })
  payloadHash: string;
  @Column({ type: 'enum', enum: WebhookEventStatus })
  status: WebhookEventStatus;
  @Column({ name: 'error_code', type: 'varchar', length: 64, nullable: true })
  errorCode: string | null;
  @Column({
    name: 'processed_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  processedAt: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
