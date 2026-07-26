import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddOrderStatusHistory1784400000000 implements MigrationInterface {
  name = 'AddOrderStatusHistory1784400000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`order_status_history\` (\`id\` varchar(36) NOT NULL, \`order_id\` varchar(36) NOT NULL, \`from_status\` enum ('PENDING', 'PAID', 'SHIPPED', 'COMPLETED', 'CANCELLED') NULL, \`to_status\` enum ('PENDING', 'PAID', 'SHIPPED', 'COMPLETED', 'CANCELLED') NOT NULL, \`actor_user_id\` varchar(36) NULL, \`actor_role\` varchar(20) NULL, \`note\` varchar(500) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_order_status_history_order_created_at\` (\`order_id\`, \`created_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`order_status_history\` ADD CONSTRAINT \`FK_order_status_history_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`order_status_history\` ADD CONSTRAINT \`FK_order_status_history_actor_user\` FOREIGN KEY (\`actor_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    // One honest creation marker per pre-existing order: NULL from_status flags
    // the row as a creation event, to_status snapshots the order's current
    // status, and the actor is the customer who placed the order.
    await queryRunner.query(
      `INSERT INTO \`order_status_history\` (\`id\`, \`order_id\`, \`from_status\`, \`to_status\`, \`actor_user_id\`, \`actor_role\`, \`note\`, \`created_at\`) SELECT UUID(), \`o\`.\`id\`, NULL, \`o\`.\`status\`, \`o\`.\`user_id\`, \`u\`.\`role\`, NULL, \`o\`.\`created_at\` FROM \`orders\` \`o\` JOIN \`users\` \`u\` ON \`u\`.\`id\` = \`o\`.\`user_id\``,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`order_status_history\` DROP FOREIGN KEY \`FK_order_status_history_actor_user\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`order_status_history\` DROP FOREIGN KEY \`FK_order_status_history_order\``,
    );
    await queryRunner.query(`DROP TABLE \`order_status_history\``);
  }
}
