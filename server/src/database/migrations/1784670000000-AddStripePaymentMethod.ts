import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStripePaymentMethod1784670000000 implements MigrationInterface {
  name = 'AddStripePaymentMethod1784670000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE `orders` MODIFY `payment_method` enum ('COD','BANK_TRANSFER','STRIPE') NOT NULL DEFAULT 'COD'");
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("UPDATE `orders` SET `payment_method` = 'BANK_TRANSFER' WHERE `payment_method` = 'STRIPE'");
    await queryRunner.query("ALTER TABLE `orders` MODIFY `payment_method` enum ('COD','BANK_TRANSFER') NOT NULL DEFAULT 'COD'");
  }
}
