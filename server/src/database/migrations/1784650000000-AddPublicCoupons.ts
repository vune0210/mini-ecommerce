import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets a coupon be advertised on the checkout page.
 *
 * Defaults to 0, and existing rows keep it. That is the only safe default: a
 * code mailed to twenty specific customers must not turn into a public promo
 * simply because a listing endpoint was added afterwards. Publishing is an
 * explicit act per coupon.
 */
export class AddPublicCoupons1784650000000 implements MigrationInterface {
  name = 'AddPublicCoupons1784650000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`coupons\` ADD \`is_public\` tinyint NOT NULL DEFAULT 0`,
    );
    // The listing filters on all three together, and the table is read on every
    // checkout page view.
    await queryRunner.query(
      `CREATE INDEX \`IDX_coupons_public_active\` ON \`coupons\` (\`is_public\`, \`is_active\`)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_coupons_public_active\` ON \`coupons\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`coupons\` DROP COLUMN \`is_public\``,
    );
  }
}
