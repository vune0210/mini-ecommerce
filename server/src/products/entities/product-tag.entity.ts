import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// The unique index name matches AddProductMediaAndTags so migration:generate
// does not propose dropping and recreating it.
@Entity({ name: 'product_tags' })
@Index('UQ_product_tags_slug', ['slug'], { unique: true })
export class ProductTag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The label as staff wrote it, diacritics and capitals intact. */
  @Column({ type: 'varchar', length: 50 })
  name: string;

  /**
   * What the storefront filters and links by, so it is unique and deliberately
   * not re-derived when the name is edited: rewriting the slug would 404 every
   * bookmarked `?tags=` URL that already points at it.
   */
  @Column({ type: 'varchar', length: 60 })
  slug: string;

  /**
   * No updated_at: a tag has two editable fields and an audit of when a label
   * was last renamed is not worth a column nobody reads.
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /** Published products carrying this tag. Aggregated by the service, not stored. */
  productCount?: number;
}
