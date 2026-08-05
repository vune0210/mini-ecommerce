import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The in-app inbox and its per-customer mute switches.
 *
 * `notifications` starts empty on purpose. Synthesizing rows from past orders
 * would hand every customer a pile of unread badges for events they lived
 * through months ago, and the titles would be written by today's code about
 * decisions made by yesterday's.
 *
 * `notification_preferences` is not backfilled either: every switch defaults to
 * on, and a missing row means exactly that, so a row per user would carry no
 * information the absence of one does not already carry.
 */
export class AddNotifications1784580000000 implements MigrationInterface {
  name = 'AddNotifications1784580000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`notifications\` (\`id\` varchar(36) NOT NULL, \`user_id\` varchar(36) NOT NULL, \`type\` enum ('ORDER_STATUS_CHANGED', 'ORDER_PLACED', 'REVIEW_MODERATED', 'COUPON_EXPIRING', 'STOCK_BACK', 'ANSWER_POSTED', 'ACCOUNT_SECURITY') NOT NULL, \`title\` varchar(200) NOT NULL, \`body\` varchar(1000) NULL, \`link\` varchar(512) NULL, \`metadata\` json NULL, \`read_at\` datetime(6) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_notifications_user_read_at\` (\`user_id\`, \`read_at\`), INDEX \`IDX_notifications_user_created_at\` (\`user_id\`, \`created_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    // Two indexes rather than one: the badge count filters on read_at and never
    // orders, while the inbox page orders by created_at over every row. A single
    // (user_id, read_at, created_at) index would serve the count but leave the
    // list sorting a filesort for the customers who have most to sort.
    await queryRunner.query(
      `ALTER TABLE \`notifications\` ADD CONSTRAINT \`FK_notifications_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE TABLE \`notification_preferences\` (\`id\` varchar(36) NOT NULL, \`user_id\` varchar(36) NOT NULL, \`order_updates\` tinyint NOT NULL DEFAULT 1, \`review_updates\` tinyint NOT NULL DEFAULT 1, \`promotions\` tinyint NOT NULL DEFAULT 1, \`stock_alerts\` tinyint NOT NULL DEFAULT 1, \`product_answers\` tinyint NOT NULL DEFAULT 1, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_notification_preferences_user\` (\`user_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    // Unique on user_id, so two concurrent settings saves cannot leave a
    // customer with two rows and an arbitrary winner at read time.
    await queryRunner.query(
      `ALTER TABLE \`notification_preferences\` ADD CONSTRAINT \`FK_notification_preferences_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`notification_preferences\` DROP FOREIGN KEY \`FK_notification_preferences_user\``,
    );
    await queryRunner.query(`DROP TABLE \`notification_preferences\``);
    await queryRunner.query(
      `ALTER TABLE \`notifications\` DROP FOREIGN KEY \`FK_notifications_user\``,
    );
    await queryRunner.query(`DROP TABLE \`notifications\``);
  }
}
