import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from './product.entity';

// The index name matches AddProductMediaAndTags so migration:generate does not
// propose dropping and recreating it.
@Entity({ name: 'product_images' })
@Index('IDX_product_images_product_position', ['productId', 'position'])
export class ProductImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * CASCADE, unlike most references to products: an image is a property of the
   * product and nothing else, so keeping orphaned rows around would only mean
   * a gallery pointing at a product that no longer exists.
   */
  @ManyToOne(() => Product, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'product_id', type: 'varchar', length: 36 })
  productId: string;

  @Column({ type: 'varchar', length: 2048 })
  url: string;

  /**
   * Nullable because a missing alt text is honest, while a fabricated one — the
   * product name repeated on every picture — is worse for a screen reader than
   * silence.
   */
  @Column({ name: 'alt_text', type: 'varchar', length: 255, nullable: true })
  altText: string | null;

  /** Dense 0..n-1 within a product; ProductImagesService renumbers on write. */
  @Column({ type: 'int', unsigned: true, default: 0 })
  position: number;

  /**
   * Exactly one row per product carries this, enforced by ProductImagesService
   * inside a transaction. Not a unique index: MySQL has no partial unique
   * index, and UNIQUE(product_id, is_primary) would also forbid a product from
   * ever holding two *non*-primary images.
   */
  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
