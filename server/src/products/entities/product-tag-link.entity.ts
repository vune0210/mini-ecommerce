import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProductTag } from './product-tag.entity';
import { Product } from './product.entity';

// Both index names match AddProductMediaAndTags so migration:generate does not
// propose dropping and recreating them.
@Entity({ name: 'product_tag_links' })
@Index('UQ_product_tag_links_product_tag', ['productId', 'tagId'], {
  unique: true,
})
@Index('IDX_product_tag_links_tag', ['tagId'])
export class ProductTagLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Both sides CASCADE: the row asserts nothing except "this product wears
   * this label", so it has no meaning once either end is gone. Deleting a tag
   * therefore unlabels products instead of being refused by them, which is the
   * opposite of how categories behave — a category is where a product lives, a
   * tag is only something written on it.
   */
  @ManyToOne(() => Product, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'product_id', type: 'varchar', length: 36 })
  productId: string;

  @ManyToOne(() => ProductTag, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'tag_id' })
  tag: ProductTag;

  @Column({ name: 'tag_id', type: 'varchar', length: 36 })
  tagId: string;

  /** Survives a tag-set replacement: only the difference is rewritten, so this
   * stays the record of when the product actually picked the label up. */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
