import 'dotenv/config';
import dataSource from '../data-source';
import { Category } from '../../categories/entities/category.entity';
import { Coupon, CouponType } from '../../coupons/entities/coupon.entity';
import { Product } from '../../products/entities/product.entity';

/** `parent` names another entry's slug; parents are created first. */
const categories = [
  { name: 'Điện tử', slug: 'dien-tu', parent: null },
  { name: 'Phụ kiện máy tính', slug: 'phu-kien-may-tinh', parent: 'dien-tu' },
  { name: 'Thời trang', slug: 'thoi-trang', parent: null },
  { name: 'Gia dụng', slug: 'gia-dung', parent: null },
];

/**
 * Demo discount codes, so the coupon flow is exercisable straight after
 * seeding. Deliberately capped and short-lived rather than open-ended — a seed
 * that reaches production should not hand out an unlimited discount.
 */
const coupons = [
  {
    code: 'WELCOME10',
    description: 'Giảm 10% cho đơn đầu tiên, tối đa 100.000đ.',
    type: CouponType.PERCENT,
    value: '10.00',
    minSubtotal: '300000.00',
    maxDiscount: '100000.00',
    usageLimit: 500,
    perUserLimit: 1,
  },
  {
    code: 'FREESHIP50K',
    description: 'Giảm 50.000đ cho đơn từ 500.000đ.',
    type: CouponType.FIXED,
    value: '50000.00',
    minSubtotal: '500000.00',
    maxDiscount: null,
    usageLimit: 200,
    perUserLimit: 2,
  },
];

const products = [
  {
    name: 'Tai nghe không dây',
    slug: 'tai-nghe-khong-day',
    description: 'Tai nghe Bluetooth nhỏ gọn, âm thanh rõ nét.',
    price: '1290000.00',
    stock: 12,
    sku: 'DT-TAI-NGHE-01',
    category: 'dien-tu',
  },
  {
    name: 'Bàn phím cơ',
    slug: 'ban-phim-co',
    description: 'Bàn phím cơ gọn nhẹ cho góc làm việc hiện đại.',
    price: '1590000.00',
    stock: 4,
    sku: 'DT-BAN-PHIM-01',
    category: 'phu-kien-may-tinh',
  },
  {
    name: 'Áo thun cotton',
    slug: 'ao-thun-cotton',
    description: 'Áo thun cotton mềm mại dùng hằng ngày.',
    price: '249000.00',
    stock: 25,
    sku: 'TT-AO-THUN-01',
    category: 'thoi-trang',
  },
  {
    name: 'Túi đeo chéo',
    slug: 'tui-deo-cheo',
    description: 'Túi đeo chéo tiện dụng với nhiều ngăn nhỏ.',
    price: '459000.00',
    stock: 0,
    sku: 'TT-TUI-CHEO-01',
    category: 'thoi-trang',
  },
  {
    name: 'Bình giữ nhiệt',
    slug: 'binh-giu-nhiet',
    description: 'Bình giữ nhiệt dung tích 500 ml.',
    price: '320000.00',
    stock: 18,
    sku: 'GD-BINH-NHIET-01',
    category: 'gia-dung',
  },
  {
    name: 'Đèn bàn LED',
    slug: 'den-ban-led',
    description: 'Đèn bàn LED với ba mức ánh sáng.',
    price: '690000.00',
    stock: 0,
    sku: 'GD-DEN-BAN-01',
    category: 'gia-dung',
  },
];

async function seed(): Promise<void> {
  await dataSource.initialize();
  const categoryRepository = dataSource.getRepository(Category);
  const productRepository = dataSource.getRepository(Product);
  const categoryBySlug = new Map<string, Category>();
  // Ordered so a parent is always created before the child that names it; the
  // list is short enough that a topological sort would be ceremony.
  for (const item of categories) {
    let category = await categoryRepository.findOneBy({ slug: item.slug });
    if (!category)
      category = await categoryRepository.save(
        categoryRepository.create({
          name: item.name,
          slug: item.slug,
          parentId: item.parent
            ? (categoryBySlug.get(item.parent)?.id ?? null)
            : null,
        }),
      );
    categoryBySlug.set(item.slug, category);
  }
  for (const item of products) {
    if (await productRepository.findOneBy({ slug: item.slug })) continue;
    const category = categoryBySlug.get(item.category);
    if (!category) throw new Error(`Missing category: ${item.category}`);
    await productRepository.save(
      productRepository.create({
        ...item,
        categoryId: category.id,
        category,
        imageUrl: null,
      }),
    );
  }
  // Idempotent like the rest of the seed: an existing code is left exactly as
  // the admin last edited it, never reset to the demo values.
  const couponRepository = dataSource.getRepository(Coupon);
  for (const item of coupons) {
    if (await couponRepository.findOneBy({ code: item.code })) continue;
    await couponRepository.save(
      couponRepository.create({
        ...item,
        startsAt: null,
        endsAt: null,
        isActive: true,
      }),
    );
  }
  console.log('Catalogue seed completed.');
  await dataSource.destroy();
}

void seed().catch(async (error: unknown) => {
  console.error(error);
  if (dataSource.isInitialized) await dataSource.destroy();
  process.exitCode = 1;
});
