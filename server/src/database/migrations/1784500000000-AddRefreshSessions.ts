import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Refresh tokens become server-side sessions: revocable, rotatable, and
 * auditable. Nothing is backfilled — the tokens handed out before this ran
 * carry no `jti`, so they cannot name a row and are rejected at the next
 * refresh. That is one forced re-login, once.
 */
export class AddRefreshSessions1784500000000 implements MigrationInterface {
  name = 'AddRefreshSessions1784500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`refresh_sessions\` (\`id\` varchar(36) NOT NULL, \`user_id\` varchar(36) NOT NULL, \`family_id\` varchar(36) NOT NULL, \`token_hash\` varchar(64) NOT NULL, \`user_agent\` varchar(255) NULL, \`ip_address\` varchar(45) NULL, \`expires_at\` datetime(6) NOT NULL, \`revoked_at\` datetime(6) NULL, \`revoked_reason\` enum ('rotated', 'logout', 'logout-all', 'password-changed', 'reuse-detected', 'account-disabled') NULL, \`replaced_by_id\` varchar(36) NULL, \`last_used_at\` datetime(6) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_refresh_sessions_token_hash\` (\`token_hash\`), INDEX \`IDX_refresh_sessions_user_created_at\` (\`user_id\`, \`created_at\`), INDEX \`IDX_refresh_sessions_family\` (\`family_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`refresh_sessions\` ADD CONSTRAINT \`FK_refresh_sessions_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`refresh_sessions\` DROP FOREIGN KEY \`FK_refresh_sessions_user\``,
    );
    await queryRunner.query(`DROP TABLE \`refresh_sessions\``);
  }
}
