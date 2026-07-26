import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddUserActiveFlag1784300000000 implements MigrationInterface {
  name = 'AddUserActiveFlag1784300000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    // Added nullable first so existing rows can be backfilled before the NOT NULL switch.
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`is_active\` tinyint(1) NULL`,
    );
    // Fail-open backfill: every pre-existing account stays usable.
    await queryRunner.query(
      `UPDATE \`users\` SET \`is_active\` = 1 WHERE \`is_active\` IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` MODIFY \`is_active\` tinyint(1) NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_users_role_is_active\` ON \`users\` (\`role\`, \`is_active\`)`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_users_role_is_active\` ON \`users\``,
    );
    await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`is_active\``);
  }
}
