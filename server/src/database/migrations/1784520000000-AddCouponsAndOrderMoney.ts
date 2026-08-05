import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Discount codes, plus the money breakdown that makes an order explainable:
 * `total_amount = subtotal_amount - discount_amount + shipping_fee`.
 *
 * Existing rows are backfilled so the invariant holds for history too — a
 * pre-coupon order had no discount and no delivery charge, so its subtotal is
 * exactly its total. `paid_at` is recovered from the status history rather than
 * guessed from `updated_at`, which would date a payment to the last time
 * anything on the order changed.
 */
export class AddCouponsAndOrderMoney1784520000000 implements MigrationInterface {
  name = 'AddCouponsAndOrderMoney1784520000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`coupons\` (\`id\` varchar(36) NOT NULL, \`code\` varchar(40) NOT NULL, \`description\` varchar(255) NULL, \`type\` enum ('PERCENT', 'FIXED') NOT NULL, \`value\` decimal(10,2) NOT NULL, \`min_subtotal\` decimal(10,2) NULL, \`max_discount\` decimal(10,2) NULL, \`starts_at\` datetime(6) NULL, \`ends_at\` datetime(6) NULL, \`usage_limit\` int UNSIGNED NULL, \`usage_count\` int UNSIGNED NOT NULL DEFAULT 0, \`per_user_limit\` int UNSIGNED NULL, \`is_active\` tinyint NOT NULL DEFAULT 1, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_coupons_code\` (\`code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );

    await queryRunner.query(
      `ALTER TABLE \`orders\` ADD \`subtotal_amount\` decimal(10,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` ADD \`discount_amount\` decimal(10,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` ADD \`shipping_fee\` decimal(10,2) NOT NULL DEFAULT '0.00'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` ADD \`coupon_id\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` ADD \`coupon_code\` varchar(40) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` ADD \`payment_method\` enum ('COD', 'BANK_TRANSFER') NOT NULL DEFAULT 'COD'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` ADD \`paid_at\` datetime(6) NULL`,
    );
    // Pre-existing orders carried no discount and no delivery charge, so the
    // subtotal they were billed at is exactly the total that was charged.
    await queryRunner.query(
      `UPDATE \`orders\` SET \`subtotal_amount\` = \`total_amount\``,
    );
    await queryRunner.query(
      `UPDATE \`orders\` \`o\` JOIN (SELECT \`order_id\`, MIN(\`created_at\`) AS \`paid_at\` FROM \`order_status_history\` WHERE \`to_status\` = 'PAID' GROUP BY \`order_id\`) \`h\` ON \`h\`.\`order_id\` = \`o\`.\`id\` SET \`o\`.\`paid_at\` = \`h\`.\`paid_at\``,
    );
    // The default existed only to make the backfill of legacy rows possible;
    // every new order computes its own subtotal.
    await queryRunner.query(
      `ALTER TABLE \`orders\` CHANGE \`subtotal_amount\` \`subtotal_amount\` decimal(10,2) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` ADD CONSTRAINT \`FK_orders_coupon\` FOREIGN KEY (\`coupon_id\`) REFERENCES \`coupons\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE \`coupon_redemptions\` (\`id\` varchar(36) NOT NULL, \`coupon_id\` varchar(36) NOT NULL, \`user_id\` varchar(36) NOT NULL, \`order_id\` varchar(36) NOT NULL, \`discount_amount\` decimal(10,2) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_coupon_redemptions_coupon_user\` (\`coupon_id\`, \`user_id\`), UNIQUE INDEX \`UQ_coupon_redemptions_order\` (\`order_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`coupon_redemptions\` ADD CONSTRAINT \`FK_coupon_redemptions_coupon\` FOREIGN KEY (\`coupon_id\`) REFERENCES \`coupons\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`coupon_redemptions\` ADD CONSTRAINT \`FK_coupon_redemptions_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`coupon_redemptions\` ADD CONSTRAINT \`FK_coupon_redemptions_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`coupon_redemptions\` DROP FOREIGN KEY \`FK_coupon_redemptions_order\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`coupon_redemptions\` DROP FOREIGN KEY \`FK_coupon_redemptions_user\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`coupon_redemptions\` DROP FOREIGN KEY \`FK_coupon_redemptions_coupon\``,
    );
    await queryRunner.query(`DROP TABLE \`coupon_redemptions\``);
    await queryRunner.query(
      `ALTER TABLE \`orders\` DROP FOREIGN KEY \`FK_orders_coupon\``,
    );
    await queryRunner.query(`ALTER TABLE \`orders\` DROP COLUMN \`paid_at\``);
    await queryRunner.query(
      `ALTER TABLE \`orders\` DROP COLUMN \`payment_method\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` DROP COLUMN \`coupon_code\``,
    );
    await queryRunner.query(`ALTER TABLE \`orders\` DROP COLUMN \`coupon_id\``);
    await queryRunner.query(
      `ALTER TABLE \`orders\` DROP COLUMN \`shipping_fee\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` DROP COLUMN \`discount_amount\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` DROP COLUMN \`subtotal_amount\``,
    );
    await queryRunner.query(`DROP TABLE \`coupons\``);
  }
}
