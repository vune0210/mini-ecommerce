import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The stock ledger. Deliberately starts empty rather than reconstructing
 * history from `order_items`: a synthesized SALE row would carry a
 * `balance_after` nobody can vouch for, and a fabricated audit trail is worse
 * than an audit trail that honestly begins today.
 */
export class AddStockMovements1784530000000 implements MigrationInterface {
  name = 'AddStockMovements1784530000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`stock_movements\` (\`id\` varchar(36) NOT NULL, \`product_id\` varchar(36) NULL, \`product_name\` varchar(255) NOT NULL, \`delta\` int NOT NULL, \`balance_after\` int UNSIGNED NOT NULL, \`reason\` enum ('SALE', 'CANCELLATION', 'ADJUSTMENT', 'RESTOCK') NOT NULL, \`order_id\` varchar(36) NULL, \`actor_user_id\` varchar(36) NULL, \`note\` varchar(500) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_stock_movements_product_created_at\` (\`product_id\`, \`created_at\`), INDEX \`IDX_stock_movements_created_at\` (\`created_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    // All three references are ON DELETE SET NULL: deleting a product, an order
    // or a staff account must never erase the record that stock moved. The
    // product_name snapshot is what keeps the row readable afterwards.
    await queryRunner.query(
      `ALTER TABLE \`stock_movements\` ADD CONSTRAINT \`FK_stock_movements_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`stock_movements\` ADD CONSTRAINT \`FK_stock_movements_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`stock_movements\` ADD CONSTRAINT \`FK_stock_movements_actor_user\` FOREIGN KEY (\`actor_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`stock_movements\` DROP FOREIGN KEY \`FK_stock_movements_actor_user\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`stock_movements\` DROP FOREIGN KEY \`FK_stock_movements_order\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`stock_movements\` DROP FOREIGN KEY \`FK_stock_movements_product\``,
    );
    await queryRunner.query(`DROP TABLE \`stock_movements\``);
  }
}
