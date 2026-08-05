import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Product image galleries and catalogue-wide tags.
 *
 * `products.image_url` is deliberately kept. Clients in the wild still read it,
 * so it becomes a mirror of whichever gallery row is primary rather than a
 * second source of truth, and the backfill below seeds one primary row per
 * product that already had a picture — without it every product would appear
 * to have lost its image the moment the storefront started rendering the
 * gallery instead.
 *
 * "Exactly one primary per product" is enforced by ProductImagesService inside
 * a transaction, not by an index: MySQL has no partial unique index, and a
 * plain UNIQUE(product_id, is_primary) would also forbid a product from ever
 * holding two *non*-primary images.
 */
export class AddProductMediaAndTags1784560000000 implements MigrationInterface {
  name = 'AddProductMediaAndTags1784560000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`product_images\` (\`id\` varchar(36) NOT NULL, \`product_id\` varchar(36) NOT NULL, \`url\` varchar(2048) NOT NULL, \`alt_text\` varchar(255) NULL, \`position\` int UNSIGNED NOT NULL DEFAULT '0', \`is_primary\` tinyint NOT NULL DEFAULT 0, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_product_images_product_position\` (\`product_id\`, \`position\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    // CASCADE, unlike most references to products: an image says nothing except
    // "this is what that product looks like", so it has no meaning once the
    // product is gone. Nothing here is worth keeping for an audit.
    await queryRunner.query(
      `ALTER TABLE \`product_images\` ADD CONSTRAINT \`FK_product_images_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE \`product_tags\` (\`id\` varchar(36) NOT NULL, \`name\` varchar(50) NOT NULL, \`slug\` varchar(60) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_product_tags_slug\` (\`slug\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    // The unique pair is the whole point of the link table: without it a
    // retried "replace the tag set" call would double-label a product, and the
    // ALL-tags filter counts links, so a duplicate would let a product match a
    // tag it only holds once.
    await queryRunner.query(
      `CREATE TABLE \`product_tag_links\` (\`id\` varchar(36) NOT NULL, \`product_id\` varchar(36) NOT NULL, \`tag_id\` varchar(36) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_product_tag_links_product_tag\` (\`product_id\`, \`tag_id\`), INDEX \`IDX_product_tag_links_tag\` (\`tag_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_tag_links\` ADD CONSTRAINT \`FK_product_tag_links_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    // CASCADE on the tag side too: a tag is a label, so deleting one unlabels
    // the products instead of being refused by them the way a category is.
    await queryRunner.query(
      `ALTER TABLE \`product_tag_links\` ADD CONSTRAINT \`FK_product_tag_links_tag\` FOREIGN KEY (\`tag_id\`) REFERENCES \`product_tags\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Backfill: every product that already has a picture starts with a gallery
    // holding exactly that picture, primary and at position 0. alt_text is left
    // NULL rather than seeded with the product name — a fabricated description
    // read aloud on every image is worse for a screen reader than silence.
    await queryRunner.query(
      `INSERT INTO \`product_images\` (\`id\`, \`product_id\`, \`url\`, \`alt_text\`, \`position\`, \`is_primary\`) SELECT UUID(), \`id\`, \`image_url\`, NULL, 0, 1 FROM \`products\` WHERE \`image_url\` IS NOT NULL AND \`image_url\` <> ''`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`product_tag_links\` DROP FOREIGN KEY \`FK_product_tag_links_tag\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_tag_links\` DROP FOREIGN KEY \`FK_product_tag_links_product\``,
    );
    await queryRunner.query(`DROP TABLE \`product_tag_links\``);
    await queryRunner.query(`DROP TABLE \`product_tags\``);
    await queryRunner.query(
      `ALTER TABLE \`product_images\` DROP FOREIGN KEY \`FK_product_images_product\``,
    );
    // products.image_url is not restored from the gallery on the way down: it
    // was never emptied, only mirrored, so every row still holds the value the
    // gallery was keeping in step with.
    await queryRunner.query(`DROP TABLE \`product_images\``);
  }
}
