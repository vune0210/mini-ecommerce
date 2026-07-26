import 'dotenv/config';
import dataSource from '../data-source';
import { Category } from '../../categories/entities/category.entity';
import { Product } from '../../products/entities/product.entity';

const categories = [
  { name: 'Điện tử', slug: 'dien-tu' },
  { name: 'Thời trang', slug: 'thoi-trang' },
  { name: 'Gia dụng', slug: 'gia-dung' },
];

const products = [
  {
    name: 'Tai nghe không dây',
    slug: 'tai-nghe-khong-day',
    description: 'Tai nghe Bluetooth nhỏ gọn, âm thanh rõ nét.',
    price: '1290000.00',
    stock: 12,
    category: 'dien-tu',
  },
  {
    name: 'Bàn phím cơ',
    slug: 'ban-phim-co',
    description: 'Bàn phím cơ gọn nhẹ cho góc làm việc hiện đại.',
    price: '1590000.00',
    stock: 4,
    category: 'dien-tu',
  },
  {
    name: 'Áo thun cotton',
    slug: 'ao-thun-cotton',
    description: 'Áo thun cotton mềm mại dùng hằng ngày.',
    price: '249000.00',
    stock: 25,
    category: 'thoi-trang',
  },
  {
    name: 'Túi đeo chéo',
    slug: 'tui-deo-cheo',
    description: 'Túi đeo chéo tiện dụng với nhiều ngăn nhỏ.',
    price: '459000.00',
    stock: 0,
    category: 'thoi-trang',
  },
  {
    name: 'Bình giữ nhiệt',
    slug: 'binh-giu-nhiet',
    description: 'Bình giữ nhiệt dung tích 500 ml.',
    price: '320000.00',
    stock: 18,
    category: 'gia-dung',
  },
  {
    name: 'Đèn bàn LED',
    slug: 'den-ban-led',
    description: 'Đèn bàn LED với ba mức ánh sáng.',
    price: '690000.00',
    stock: 0,
    category: 'gia-dung',
  },
];

async function seed(): Promise<void> {
  await dataSource.initialize();
  const categoryRepository = dataSource.getRepository(Category);
  const productRepository = dataSource.getRepository(Product);
  const categoryBySlug = new Map<string, Category>();
  for (const item of categories) {
    let category = await categoryRepository.findOneBy({ slug: item.slug });
    if (!category)
      category = await categoryRepository.save(categoryRepository.create(item));
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
  console.log('Catalogue seed completed.');
  await dataSource.destroy();
}

void seed().catch(async (error: unknown) => {
  console.error(error);
  if (dataSource.isInitialized) await dataSource.destroy();
  process.exitCode = 1;
});
