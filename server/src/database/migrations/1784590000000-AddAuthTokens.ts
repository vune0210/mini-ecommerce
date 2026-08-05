import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Out-of-band credential tokens (password reset, email verification) plus the
 * `users.email_verified_at` flag they stamp.
 *
 * Only the SHA-256 of each token is stored, exactly as `refresh_sessions` does:
 * these secrets travel by email, so a dump of this table must not be replayable.
 *
 * The backfill is the load-bearing part. `email_verified_at` is set to each
 * account's `created_at`, so every account that existed before this ran is
 * treated as verified. Leaving them NULL would mark the entire user base
 * unverified overnight and hand every one of them a nag — or a lockout — for a
 * mailbox they proved they could read years ago. `created_at` rather than NOW()
 * because it is the closest true statement available and stays stable if the
 * migration is replayed on a restored dump.
 */
export class AddAuthTokens1784590000000 implements MigrationInterface {
  name = 'AddAuthTokens1784590000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`auth_tokens\` (\`id\` varchar(36) NOT NULL, \`user_id\` varchar(36) NOT NULL, \`purpose\` enum ('password-reset', 'email-verification') NOT NULL, \`token_hash\` varchar(64) NOT NULL, \`expires_at\` datetime(6) NOT NULL, \`consumed_at\` datetime(6) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_auth_tokens_token_hash\` (\`token_hash\`), INDEX \`IDX_auth_tokens_user_purpose\` (\`user_id\`, \`purpose\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`auth_tokens\` ADD CONSTRAINT \`FK_auth_tokens_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`email_verified_at\` datetime(6) NULL`,
    );
    // Fail-open backfill: every pre-existing account stays verified.
    await queryRunner.query(
      `UPDATE \`users\` SET \`email_verified_at\` = \`created_at\` WHERE \`email_verified_at\` IS NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`email_verified_at\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`auth_tokens\` DROP FOREIGN KEY \`FK_auth_tokens_user\``,
    );
    await queryRunner.query(`DROP TABLE \`auth_tokens\``);
  }
}
