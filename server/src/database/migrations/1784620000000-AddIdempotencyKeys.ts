import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * At-most-once execution for checkout. The unique index is the mechanism, not
 * an optimisation: claiming a key is an INSERT that either wins or collides, so
 * a double-tapped "place order" cannot create two orders even when both
 * requests are in flight at the same instant.
 *
 * Nothing is backfilled — the table records intent that only exists from the
 * moment clients start sending the header.
 */
export class AddIdempotencyKeys1784620000000 implements MigrationInterface {
  name = 'AddIdempotencyKeys1784620000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`idempotency_keys\` (\`id\` varchar(36) NOT NULL, \`user_id\` varchar(36) NOT NULL, \`scope\` varchar(60) NOT NULL, \`idempotency_key\` varchar(128) NOT NULL, \`request_hash\` varchar(64) NOT NULL, \`state\` enum ('IN_FLIGHT', 'COMPLETED') NOT NULL, \`response_status\` int UNSIGNED NULL, \`response_body\` json NULL, \`expires_at\` datetime(6) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_idempotency_keys_user_scope_key\` (\`user_id\`, \`scope\`, \`idempotency_key\`), INDEX \`IDX_idempotency_keys_expires_at\` (\`expires_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    // CASCADE: a deleted account's stored responses are that account's data and
    // have no meaning without it.
    await queryRunner.query(
      `ALTER TABLE \`idempotency_keys\` ADD CONSTRAINT \`FK_idempotency_keys_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`idempotency_keys\` DROP FOREIGN KEY \`FK_idempotency_keys_user\``,
    );
    await queryRunner.query(`DROP TABLE \`idempotency_keys\``);
  }
}
