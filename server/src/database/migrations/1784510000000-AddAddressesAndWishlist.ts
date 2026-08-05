import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two per-customer books: saved delivery destinations and saved products.
 *
 * `addresses` is intentionally not backfilled from historical orders. An order
 * records where it actually shipped, which is not the same claim as "this is
 * somewhere the customer still wants parcels sent".
 */
export class AddAddressesAndWishlist1784510000000 implements MigrationInterface {
  name = 'AddAddressesAndWishlist1784510000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`addresses\` (\`id\` varchar(36) NOT NULL, \`user_id\` varchar(36) NOT NULL, \`label\` varchar(50) NULL, \`recipient_name\` varchar(100) NOT NULL, \`phone\` varchar(20) NOT NULL, \`address_line\` varchar(255) NOT NULL, \`ward\` varchar(100) NULL, \`district\` varchar(100) NULL, \`city\` varchar(100) NOT NULL, \`is_default\` tinyint NOT NULL DEFAULT 0, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_addresses_user_default\` (\`user_id\`, \`is_default\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`addresses\` ADD CONSTRAINT \`FK_addresses_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE TABLE \`wishlist_items\` (\`id\` varchar(36) NOT NULL, \`user_id\` varchar(36) NOT NULL, \`product_id\` varchar(36) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_wishlist_items_user_product\` (\`user_id\`, \`product_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`wishlist_items\` ADD CONSTRAINT \`FK_wishlist_items_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`wishlist_items\` ADD CONSTRAINT \`FK_wishlist_items_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`wishlist_items\` DROP FOREIGN KEY \`FK_wishlist_items_product\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`wishlist_items\` DROP FOREIGN KEY \`FK_wishlist_items_user\``,
    );
    await queryRunner.query(`DROP TABLE \`wishlist_items\``);
    await queryRunner.query(
      `ALTER TABLE \`addresses\` DROP FOREIGN KEY \`FK_addresses_user\``,
    );
    await queryRunner.query(`DROP TABLE \`addresses\``);
  }
}
