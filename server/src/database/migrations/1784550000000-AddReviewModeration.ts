import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Review moderation and helpful votes.
 *
 * `is_hidden` defaults to 0, so every existing review stays visible and every
 * product keeps the rating average it had — a moderation feature must not
 * silently re-score the catalogue on the day it ships.
 */
export class AddReviewModeration1784550000000 implements MigrationInterface {
  name = 'AddReviewModeration1784550000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`reviews\` ADD \`is_hidden\` tinyint NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE \`reviews\` ADD \`helpful_count\` int UNSIGNED NOT NULL DEFAULT 0`,
    );
    // Every storefront read filters product + visibility before ordering.
    await queryRunner.query(
      `CREATE INDEX \`IDX_reviews_product_hidden\` ON \`reviews\` (\`product_id\`, \`is_hidden\`)`,
    );
    await queryRunner.query(
      `CREATE TABLE \`review_votes\` (\`id\` varchar(36) NOT NULL, \`review_id\` varchar(36) NOT NULL, \`user_id\` varchar(36) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_review_votes_review_user\` (\`review_id\`, \`user_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`review_votes\` ADD CONSTRAINT \`FK_review_votes_review\` FOREIGN KEY (\`review_id\`) REFERENCES \`reviews\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`review_votes\` ADD CONSTRAINT \`FK_review_votes_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`review_votes\` DROP FOREIGN KEY \`FK_review_votes_user\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`review_votes\` DROP FOREIGN KEY \`FK_review_votes_review\``,
    );
    await queryRunner.query(`DROP TABLE \`review_votes\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_reviews_product_hidden\` ON \`reviews\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`reviews\` DROP COLUMN \`helpful_count\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`reviews\` DROP COLUMN \`is_hidden\``,
    );
  }
}
