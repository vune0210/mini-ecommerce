import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddOrderShippingDetails1784100000000 implements MigrationInterface {
  name = 'AddOrderShippingDetails1784100000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    // Added nullable first so existing rows can be backfilled before the NOT NULL switch.
    await queryRunner.query(
      `ALTER TABLE \`orders\` ADD \`order_number\` varchar(24) NULL, ADD \`recipient_name\` varchar(100) NULL, ADD \`phone\` varchar(20) NULL, ADD \`address_line\` varchar(255) NULL, ADD \`ward\` varchar(100) NULL, ADD \`district\` varchar(100) NULL, ADD \`city\` varchar(100) NULL, ADD \`note\` varchar(500) NULL`,
    );
    await queryRunner.query(
      `UPDATE \`orders\` SET \`order_number\` = CONCAT('ORD-LEGACY-', UPPER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 10))) WHERE \`order_number\` IS NULL`,
    );
    await queryRunner.query(
      `UPDATE \`orders\` \`o\` JOIN \`users\` \`u\` ON \`u\`.\`id\` = \`o\`.\`user_id\` SET \`o\`.\`recipient_name\` = \`u\`.\`name\` WHERE \`o\`.\`recipient_name\` IS NULL`,
    );
    await queryRunner.query(
      `UPDATE \`orders\` SET \`phone\` = 'unknown', \`address_line\` = 'unknown', \`city\` = 'unknown' WHERE \`phone\` IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` MODIFY \`order_number\` varchar(24) NOT NULL, MODIFY \`recipient_name\` varchar(100) NOT NULL, MODIFY \`phone\` varchar(20) NOT NULL, MODIFY \`address_line\` varchar(255) NOT NULL, MODIFY \`city\` varchar(100) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` ADD UNIQUE INDEX \`UQ_orders_order_number\` (\`order_number\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_orders_status_created_at\` ON \`orders\` (\`status\`, \`created_at\`)`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_orders_status_created_at\` ON \`orders\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` DROP INDEX \`UQ_orders_order_number\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` DROP COLUMN \`note\`, DROP COLUMN \`city\`, DROP COLUMN \`district\`, DROP COLUMN \`ward\`, DROP COLUMN \`address_line\`, DROP COLUMN \`phone\`, DROP COLUMN \`recipient_name\`, DROP COLUMN \`order_number\``,
    );
  }
}
