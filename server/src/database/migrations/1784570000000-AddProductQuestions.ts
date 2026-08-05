import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Public product Q&A: questions on a product page, answers to them, and one
 * "helpful" vote per customer per answer.
 *
 * `answer_count` counts *visible* answers only and starts at 0 with nothing to
 * backfill — the feature ships with no history. It is moved solely by the
 * service, in the same transaction as the row it counts, which is why the
 * column is unsigned: a counter that can go negative is a counter nobody
 * noticed was already wrong.
 *
 * `is_official` is a snapshot of "an admin wrote this", not a join to the
 * author's current role, so promoting or demoting a user never rewrites what
 * the shop has already said in public.
 */
export class AddProductQuestions1784570000000 implements MigrationInterface {
  name = 'AddProductQuestions1784570000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // IDX_product_questions_product_hidden serves every storefront read, which
    // filters product + visibility before ordering;
    // IDX_product_questions_hidden_answers serves the moderation queue, which
    // filters visibility and the unanswered backlog across all products.
    await queryRunner.query(
      `CREATE TABLE \`product_questions\` (\`id\` varchar(36) NOT NULL, \`product_id\` varchar(36) NOT NULL, \`user_id\` varchar(36) NOT NULL, \`body\` varchar(1000) NOT NULL, \`is_hidden\` tinyint NOT NULL DEFAULT 0, \`answer_count\` int UNSIGNED NOT NULL DEFAULT 0, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_product_questions_product_hidden\` (\`product_id\`, \`is_hidden\`), INDEX \`IDX_product_questions_hidden_answers\` (\`is_hidden\`, \`answer_count\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`product_answers\` (\`id\` varchar(36) NOT NULL, \`question_id\` varchar(36) NOT NULL, \`user_id\` varchar(36) NOT NULL, \`body\` varchar(1000) NOT NULL, \`is_official\` tinyint NOT NULL DEFAULT 0, \`is_hidden\` tinyint NOT NULL DEFAULT 0, \`helpful_count\` int UNSIGNED NOT NULL DEFAULT 0, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_product_answers_question_hidden\` (\`question_id\`, \`is_hidden\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`answer_votes\` (\`id\` varchar(36) NOT NULL, \`answer_id\` varchar(36) NOT NULL, \`user_id\` varchar(36) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_answer_votes_answer_user\` (\`answer_id\`, \`user_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_questions\` ADD CONSTRAINT \`FK_product_questions_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_questions\` ADD CONSTRAINT \`FK_product_questions_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    // Deleting a question takes its whole thread with it: an answer with no
    // question is unreadable, and the votes on it meaningless.
    await queryRunner.query(
      `ALTER TABLE \`product_answers\` ADD CONSTRAINT \`FK_product_answers_question\` FOREIGN KEY (\`question_id\`) REFERENCES \`product_questions\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_answers\` ADD CONSTRAINT \`FK_product_answers_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`answer_votes\` ADD CONSTRAINT \`FK_answer_votes_answer\` FOREIGN KEY (\`answer_id\`) REFERENCES \`product_answers\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`answer_votes\` ADD CONSTRAINT \`FK_answer_votes_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`answer_votes\` DROP FOREIGN KEY \`FK_answer_votes_user\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`answer_votes\` DROP FOREIGN KEY \`FK_answer_votes_answer\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_answers\` DROP FOREIGN KEY \`FK_product_answers_user\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_answers\` DROP FOREIGN KEY \`FK_product_answers_question\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_questions\` DROP FOREIGN KEY \`FK_product_questions_user\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_questions\` DROP FOREIGN KEY \`FK_product_questions_product\``,
    );
    await queryRunner.query(`DROP TABLE \`answer_votes\``);
    await queryRunner.query(`DROP TABLE \`product_answers\``);
    await queryRunner.query(`DROP TABLE \`product_questions\``);
  }
}
