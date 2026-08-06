import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentInfrastructure1784660000000 implements MigrationInterface {
  name = 'AddPaymentInfrastructure1784660000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`payments\` (\`id\` varchar(36) NOT NULL, \`order_id\` varchar(36) NOT NULL, \`provider\` varchar(32) NOT NULL, \`external_payment_id\` varchar(128) NULL, \`status\` enum ('PENDING','AUTHORIZED','SUCCEEDED','FAILED','CANCELLED','REFUND_PENDING','PARTIALLY_REFUNDED','REFUNDED') NOT NULL DEFAULT 'PENDING', \`amount\` decimal(10,2) NOT NULL, \`refunded_amount\` decimal(10,2) NOT NULL DEFAULT '0.00', \`currency\` char(3) NOT NULL DEFAULT 'VND', \`failure_code\` varchar(64) NULL, \`failure_message\` varchar(255) NULL, \`metadata\` json NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_payments_order_created_at\` (\`order_id\`, \`created_at\`), UNIQUE INDEX \`UQ_payments_provider_external\` (\`provider\`, \`external_payment_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`payment_refunds\` (\`id\` varchar(36) NOT NULL, \`payment_id\` varchar(36) NOT NULL, \`provider\` varchar(32) NOT NULL, \`external_refund_id\` varchar(128) NULL, \`idempotency_key\` varchar(128) NOT NULL, \`status\` enum ('PENDING','SUCCEEDED','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING', \`amount\` decimal(10,2) NOT NULL, \`reason\` varchar(255) NULL, \`requested_by\` varchar(36) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_payment_refunds_payment_key\` (\`payment_id\`, \`idempotency_key\`), UNIQUE INDEX \`UQ_payment_refunds_provider_external\` (\`provider\`, \`external_refund_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`payment_webhook_events\` (\`id\` varchar(36) NOT NULL, \`provider\` varchar(32) NOT NULL, \`external_event_id\` varchar(128) NOT NULL, \`payload_hash\` char(64) NOT NULL, \`status\` enum ('PROCESSING','PROCESSED','FAILED') NOT NULL, \`error_code\` varchar(64) NULL, \`processed_at\` datetime(6) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_payment_webhooks_provider_event\` (\`provider\`, \`external_event_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`payments\` ADD CONSTRAINT \`FK_payments_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`payment_refunds\` ADD CONSTRAINT \`FK_payment_refunds_payment\` FOREIGN KEY (\`payment_id\`) REFERENCES \`payments\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    // Existing orders predate the ledger. Backfill one manual record each so
    // reports and future refunds never have a silent historical gap.
    await queryRunner.query(
      `INSERT INTO \`payments\` (\`id\`, \`order_id\`, \`provider\`, \`status\`, \`amount\`, \`refunded_amount\`, \`currency\`, \`metadata\`, \`created_at\`, \`updated_at\`) SELECT UUID(), \`id\`, 'MANUAL', CASE WHEN \`status\` IN ('PAID','SHIPPED','COMPLETED') THEN 'SUCCEEDED' WHEN \`status\` = 'CANCELLED' THEN 'CANCELLED' ELSE 'PENDING' END, \`total_amount\`, '0.00', 'VND', JSON_OBJECT('paymentMethod', \`payment_method\`), \`created_at\`, \`updated_at\` FROM \`orders\``,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`payment_refunds\` DROP FOREIGN KEY \`FK_payment_refunds_payment\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`payments\` DROP FOREIGN KEY \`FK_payments_order\``,
    );
    await queryRunner.query(`DROP TABLE \`payment_webhook_events\``);
    await queryRunner.query(`DROP TABLE \`payment_refunds\``);
    await queryRunner.query(`DROP TABLE \`payments\``);
  }
}
