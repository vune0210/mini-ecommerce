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
import { Category } from '../../categories/entities/category.entity';
import type { ProductImage } from './product-image.entity';
import type { ProductTag } from './product-tag.entity';

// Index names match AddCatalogHierarchyAndSku so migration:generate does not
// propose dropping and recreating them.
@Entity({ name: 'products' })
@Index('UQ_products_sku', ['sku'], { unique: true })
@Index('IDX_products_is_active_category', ['isActive', 'categoryId'])
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Column({ type: 'varchar', length: 255 })
  name: string;
  @Column({ type: 'varchar', length: 280, unique: true })
  slug: string;
  /**
   * Warehouse identity, distinct from `slug`: the slug is a URL and changes
   * with marketing copy, the SKU is what is printed on the shelf label.
   * Nullable because a catalogue can exist before stock control does — but
   * unique when set, so two products cannot claim the same shelf.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  sku: string | null;
  /**
   * Unpublished products vanish from the storefront: hidden from listings and
   * search, 404 on public detail, refused at add-to-cart and at checkout. This
   * is the intended alternative to deleting a product that has order history.
   */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
  @Column({ type: 'text' })
  description: string;
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: string;
  @Column({ type: 'int', unsigned: true, default: 0 })
  stock: number;
  /**
   * The legacy single image. Kept because storefront clients still read it, but
   * it is no longer written by hand: ProductImagesService mirrors whichever
   * gallery row is primary into it, so the two can never disagree.
   */
  @Column({ name: 'image_url', type: 'varchar', length: 2048, nullable: true })
  imageUrl: string | null;
  @ManyToOne(() => Category, (category) => category.products, {
    onDelete: 'RESTRICT',
    nullable: false,
  })
  @JoinColumn({ name: 'category_id' })
  category: Category;
  @Column({ name: 'category_id', type: 'varchar', length: 36 })
  categoryId: string;
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
  /** Aggregated from the reviews table by ProductsService; not a stored column. */
  averageRating?: number;
  /** Aggregated from the reviews table by ProductsService; not a stored column. */
  reviewCount?: number;
  /**
   * The gallery, attached by ProductsService on detail responses. Deliberately
   * a plain field and not a TypeORM `@OneToMany`: src/database/data-source.ts
   * lists its entities one by one, and a relation pointing at an entity missing
   * from that list breaks the migration CLI for everyone. `reviews` is absent
   * from this entity for the same reason.
   */
  images?: ProductImage[];
  /** Attached by ProductsService on detail responses; not a stored column. */
  tags?: ProductTag[];
}
