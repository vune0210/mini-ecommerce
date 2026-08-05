import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Back-in-stock subscriptions.
 *
 * No `notified_at` column: an alert is deleted the moment it fires, because a
 * subscription that has been honoured is not a record anyone needs — and the
 * deletion is what lets the same customer subscribe again the next time the
 * product sells out. Keeping the row and flagging it would mean the unique
 * pair below could never be re-used without a second "is it spent" predicate
 * on every read.
 */
export class AddStockAlerts1784640000000 implements MigrationInterface {
  name = 'AddStockAlerts1784640000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`stock_alerts\` (\`id\` varchar(36) NOT NULL, \`user_id\` varchar(36) NOT NULL, \`product_id\` varchar(36) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_stock_alerts_user_product\` (\`user_id\`, \`product_id\`), INDEX \`IDX_stock_alerts_product\` (\`product_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`stock_alerts\` ADD CONSTRAINT \`FK_stock_alerts_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    // CASCADE on the product too: a delisted product's waiting list has nothing
    // left to wait for, and an alert that can never fire is worse than none.
    await queryRunner.query(
      `ALTER TABLE \`stock_alerts\` ADD CONSTRAINT \`FK_stock_alerts_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`stock_alerts\` DROP FOREIGN KEY \`FK_stock_alerts_product\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`stock_alerts\` DROP FOREIGN KEY \`FK_stock_alerts_user\``,
    );
    await queryRunner.query(`DROP TABLE \`stock_alerts\``);
  }
}
