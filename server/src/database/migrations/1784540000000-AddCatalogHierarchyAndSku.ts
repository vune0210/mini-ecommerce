import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nested categories, plus a warehouse identifier and a publication flag on
 * products.
 *
 * `is_active` defaults to 1 and every existing row keeps it: an upgrade must
 * never unpublish a live catalogue. `sku` stays NULL for existing products
 * because inventing one would put a fake identifier on a real shelf label —
 * the unique index tolerates any number of NULLs in MySQL, so the column can
 * be filled in later, product by product.
 */
export class AddCatalogHierarchyAndSku1784540000000 implements MigrationInterface {
  name = 'AddCatalogHierarchyAndSku1784540000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`products\` ADD \`sku\` varchar(64) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` ADD UNIQUE INDEX \`UQ_products_sku\` (\`sku\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` ADD \`is_active\` tinyint NOT NULL DEFAULT 1`,
    );
    // Partial index: every storefront listing filters on is_active first, and
    // the category column is what the filters narrow by next.
    await queryRunner.query(
      `CREATE INDEX \`IDX_products_is_active_category\` ON \`products\` (\`is_active\`, \`category_id\`)`,
    );

    await queryRunner.query(
      `ALTER TABLE \`categories\` ADD \`parent_id\` varchar(36) NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_categories_parent\` ON \`categories\` (\`parent_id\`)`,
    );
    // RESTRICT, not SET NULL: silently re-parenting a subtree to the root
    // destroys the only record of how the catalogue was organised.
    await queryRunner.query(
      `ALTER TABLE \`categories\` ADD CONSTRAINT \`FK_categories_parent\` FOREIGN KEY (\`parent_id\`) REFERENCES \`categories\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`categories\` DROP FOREIGN KEY \`FK_categories_parent\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_categories_parent\` ON \`categories\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`categories\` DROP COLUMN \`parent_id\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_products_is_active_category\` ON \`products\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` DROP COLUMN \`is_active\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` DROP INDEX \`UQ_products_sku\``,
    );
    await queryRunner.query(`ALTER TABLE \`products\` DROP COLUMN \`sku\``);
  }
}
