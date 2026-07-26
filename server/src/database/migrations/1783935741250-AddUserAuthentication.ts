import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAuthentication1783935741250 implements MigrationInterface {
  name = 'AddUserAuthentication1783935741250';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX \`UQ_users_email\` ON \`users\``);
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`name\` varchar(100) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`password\` varchar(255) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`role\` enum ('ADMIN', 'CUSTOMER') NOT NULL DEFAULT 'CUSTOMER'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD UNIQUE INDEX \`IDX_97672ac88f789774dd47f7c8be\` (\`email\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP INDEX \`IDX_97672ac88f789774dd47f7c8be\``,
    );
    await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`role\``);
    await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`password\``);
    await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`name\``);
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`UQ_users_email\` ON \`users\` (\`email\`)`,
    );
  }
}
