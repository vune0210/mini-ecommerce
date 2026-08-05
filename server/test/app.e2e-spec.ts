/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
// Supertest response bodies are intentionally untyped at this HTTP boundary.
//
// DB_NAME is redirected to DB_NAME_TEST by test/setup-env.ts, registered as a
// jest `setupFiles` entry. It cannot live here: ts-jest hoists imports, so a
// guard written above them still runs after the module graph has loaded.

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Product } from '../src/products/entities/product.entity';
import { User, UserRole } from '../src/users/entities/user.entity';
import { resetDatabase } from './utils/db';

type Account = { token: string; userId: string };

describe('API e2e (MySQL test database)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let sequence = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase(dataSource);
  });

  const shipping = {
    recipientName: 'Nguyen Van A',
    phone: '0901234567',
    addressLine: '12 Nguyen Hue',
    city: 'Ho Chi Minh',
  };
  async function placeOrder(customer: Account) {
    return request(app.getHttpServer())
      .post('/api/orders/checkout')
      .set(bearer(customer.token))
      .send(shipping);
  }
  /** Drives an order all the way to COMPLETED, which is what unlocks reviewing. */
  async function completeOrder(admin: Account, orderId: string): Promise<void> {
    for (const status of ['PAID', 'SHIPPED', 'COMPLETED'])
      expect(
        (
          await request(app.getHttpServer())
            .patch(`/api/orders/${orderId}/status`)
            .set(bearer(admin.token))
            .send({ status })
        ).status,
      ).toBe(200);
  }

  const unique = (prefix: string) => `${prefix}-${Date.now()}-${sequence++}`;
  async function account(role: UserRole = UserRole.CUSTOMER): Promise<Account> {
    const email = `${unique(role.toLowerCase())}@test.local`;
    const password = 'Password123!';
    const register = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, name: role });
    expect(register.status).toBe(201);
    if (role === UserRole.ADMIN)
      await dataSource.getRepository(User).update(register.body.id, { role });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password });
    expect(login.status).toBe(201);
    return { token: login.body.accessToken, userId: register.body.id };
  }
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  async function catalog(
    admin: Account,
    stock = 10,
  ): Promise<{ categoryId: string; product: Product }> {
    const slug = unique('category');
    const category = await request(app.getHttpServer())
      .post('/api/categories')
      .set(bearer(admin.token))
      .send({ name: slug, slug });
    expect(category.status).toBe(201);
    const productSlug = unique('product');
    const productResponse = await request(app.getHttpServer())
      .post('/api/products')
      .set(bearer(admin.token))
      .send({
        name: productSlug,
        slug: productSlug,
        description: 'test product',
        price: 12.5,
        stock,
        categoryId: category.body.id,
      });
    expect(productResponse.status).toBe(201);
    return {
      categoryId: category.body.id,
      product: productResponse.body as Product,
    };
  }
  async function addToCart(customer: Account, productId: string, quantity = 1) {
    return request(app.getHttpServer())
      .post('/api/cart/items')
      .set(bearer(customer.token))
      .send({ productId, quantity });
  }

  describe('auth and authorization', () => {
    it('registers, logs in, rejects no token, and rejects customer admin writes', async () => {
      const customer = await account();
      const admin = await account(UserRole.ADMIN);
      const { categoryId } = await catalog(admin);
      expect(
        await request(app.getHttpServer()).get('/api/cart'),
      ).toHaveProperty('status', 401);
      const denied = await request(app.getHttpServer())
        .post('/api/products')
        .set(bearer(customer.token))
        .send({
          name: 'denied',
          slug: unique('denied'),
          description: 'x',
          price: 1,
          stock: 1,
          categoryId,
        });
      expect(denied.status).toBe(403);
    });
  });

  describe('products and categories', () => {
    it('serves public reads/search/pagination and permits admin CRUD only', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { categoryId, product } = await catalog(admin);
      const publicList = await request(app.getHttpServer()).get(
        `/api/products?search=${encodeURIComponent(product.name)}&page=1&limit=1`,
      );
      expect(publicList.status).toBe(200);
      expect(publicList.body).toEqual(
        expect.objectContaining({
          items: expect.any(Array),
          total: 1,
          page: 1,
          limit: 1,
        }),
      );
      expect(
        (
          await request(app.getHttpServer())
            .patch(`/api/products/${product.id}`)
            .set(bearer(customer.token))
            .send({ stock: 2 })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app.getHttpServer())
            .patch(`/api/products/${product.id}`)
            .set(bearer(admin.token))
            .send({ stock: 2 })
        ).status,
      ).toBe(200);
      expect(
        (
          await request(app.getHttpServer())
            .delete(`/api/products/${product.id}`)
            .set(bearer(admin.token))
        ).status,
      ).toBe(204);
      expect(
        (
          await request(app.getHttpServer())
            .delete(`/api/categories/${categoryId}`)
            .set(bearer(admin.token))
        ).status,
      ).toBe(204);
    });
  });

  describe('cart', () => {
    it('increments duplicate products, enforces stock, and removes items', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalog(admin, 2);
      expect((await addToCart(customer, product.id)).status).toBe(201);
      const duplicate = await addToCart(customer, product.id);
      expect(duplicate.status).toBe(201);
      expect(duplicate.body.items).toHaveLength(1);
      expect(duplicate.body.items[0].quantity).toBe(2);
      const tooMany = await request(app.getHttpServer())
        .patch(`/api/cart/items/${duplicate.body.items[0].id}`)
        .set(bearer(customer.token))
        .send({ quantity: 3 });
      expect(tooMany.status).toBe(400);
      const removed = await request(app.getHttpServer())
        .delete(`/api/cart/items/${duplicate.body.items[0].id}`)
        .set(bearer(customer.token));
      expect(removed.status).toBe(200);
      expect(removed.body.totalItems).toBe(0);
    });
  });

  describe('orders', () => {
    it('checks out, decrements stock, and empties cart', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalog(admin, 5);
      await addToCart(customer, product.id, 2);
      const checkout = await placeOrder(customer);
      expect(checkout.status).toBe(201);
      expect(checkout.body).toEqual(
        expect.objectContaining({
          status: 'PENDING',
          totalAmount: '25.00',
          recipientName: shipping.recipientName,
          phone: shipping.phone,
          addressLine: shipping.addressLine,
          city: shipping.city,
          ward: null,
          district: null,
          note: null,
        }),
      );
      expect(checkout.body.orderNumber).toMatch(/^ORD-\d{6}-[0-9A-Z]{5}$/);
      expect(
        (
          await dataSource
            .getRepository(Product)
            .findOneByOrFail({ id: product.id })
        ).stock,
      ).toBe(3);
      expect(
        (
          await request(app.getHttpServer())
            .get('/api/cart')
            .set(bearer(customer.token))
        ).body.totalItems,
      ).toBe(0);
    });
    it('returns 409 with affected items when stock changed after cart add', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalog(admin, 2);
      await addToCart(customer, product.id, 2);
      await dataSource.getRepository(Product).update(product.id, { stock: 1 });
      const checkout = await placeOrder(customer);
      expect(checkout.status).toBe(409);
      expect(checkout.body.items).toEqual([
        expect.objectContaining({
          productId: product.id,
          requested: 2,
          available: 1,
        }),
      ]);
    });
    it('cancels pending orders, restores stock, and blocks another customer', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const stranger = await account();
      const { product } = await catalog(admin, 3);
      await addToCart(customer, product.id);
      const order = await placeOrder(customer);
      expect(
        (
          await request(app.getHttpServer())
            .get(`/api/orders/${order.body.id}`)
            .set(bearer(stranger.token))
        ).status,
      ).toBe(403);
      const cancelled = await request(app.getHttpServer())
        .patch(`/api/orders/${order.body.id}/cancel`)
        .set(bearer(customer.token));
      expect(cancelled.body.status).toBe('CANCELLED');
      expect(
        (
          await dataSource
            .getRepository(Product)
            .findOneByOrFail({ id: product.id })
        ).stock,
      ).toBe(3);
    });
    it('allows admin forward transitions and rejects invalid ones', async () => {
      const admin = await account(UserRole.ADMIN);
      const { product } = await catalog(admin, 3);
      await addToCart(admin, product.id);
      const order = await placeOrder(admin);
      await completeOrder(admin, order.body.id);
      expect(
        (
          await request(app.getHttpServer())
            .patch(`/api/orders/${order.body.id}/status`)
            .set(bearer(admin.token))
            .send({ status: 'PENDING' })
        ).status,
      ).toBe(400);
    });
    it('rejects checkout without valid shipping details', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalog(admin, 3);
      await addToCart(customer, product.id);
      expect(
        (
          await request(app.getHttpServer())
            .post('/api/orders/checkout')
            .set(bearer(customer.token))
        ).status,
      ).toBe(400);
      expect(
        (
          await request(app.getHttpServer())
            .post('/api/orders/checkout')
            .set(bearer(customer.token))
            .send({ ...shipping, phone: '12345' })
        ).status,
      ).toBe(400);
    });
    it('paginates and filters the customer and admin order lists', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalog(admin, 10);
      await addToCart(customer, product.id);
      const first = await placeOrder(customer);
      await addToCart(customer, product.id);
      await placeOrder(customer);

      const paged = await request(app.getHttpServer())
        .get('/api/orders?page=1&limit=1')
        .set(bearer(customer.token));
      expect(paged.status).toBe(200);
      expect(paged.body).toEqual(
        expect.objectContaining({ total: 2, page: 1, limit: 1 }),
      );
      expect(paged.body.items).toHaveLength(1);

      await request(app.getHttpServer())
        .patch(`/api/orders/${first.body.id}/cancel`)
        .set(bearer(customer.token));
      const filtered = await request(app.getHttpServer())
        .get('/api/orders?status=CANCELLED')
        .set(bearer(customer.token));
      expect(filtered.body.total).toBe(1);
      expect(filtered.body.items[0].id).toBe(first.body.id);

      const searched = await request(app.getHttpServer())
        .get(
          `/api/orders/admin/all?search=${encodeURIComponent(first.body.orderNumber)}`,
        )
        .set(bearer(admin.token));
      expect(searched.body.total).toBe(1);
      expect(searched.body.items[0].user.id).toBe(customer.userId);
      expect(
        (
          await request(app.getHttpServer())
            .get('/api/orders/admin/all')
            .set(bearer(customer.token))
        ).status,
      ).toBe(403);
    });
  });

  describe('reviews', () => {
    it('allows one review per completed purchase and aggregates the rating', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const stranger = await account();
      const { product } = await catalog(admin, 5);
      await addToCart(customer, product.id);
      const order = await placeOrder(customer);

      // A pending order is not enough to unlock reviewing.
      expect(
        (
          await request(app.getHttpServer())
            .post(`/api/products/${product.id}/reviews`)
            .set(bearer(customer.token))
            .send({ rating: 5 })
        ).status,
      ).toBe(403);

      await completeOrder(admin, order.body.id);
      const created = await request(app.getHttpServer())
        .post(`/api/products/${product.id}/reviews`)
        .set(bearer(customer.token))
        .send({ rating: 4, comment: 'Dung tot.' });
      expect(created.status).toBe(201);
      expect(created.body.author.name).toBe(UserRole.CUSTOMER);
      expect(created.body).not.toHaveProperty('user');

      expect(
        (
          await request(app.getHttpServer())
            .post(`/api/products/${product.id}/reviews`)
            .set(bearer(customer.token))
            .send({ rating: 3 })
        ).status,
      ).toBe(409);
      expect(
        (
          await request(app.getHttpServer())
            .post(`/api/products/${product.id}/reviews`)
            .set(bearer(stranger.token))
            .send({ rating: 1 })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(app.getHttpServer())
            .post(`/api/products/${product.id}/reviews`)
            .set(bearer(customer.token))
            .send({ rating: 6 })
        ).status,
      ).toBe(400);

      const listed = await request(app.getHttpServer()).get(
        `/api/products/${product.id}/reviews`,
      );
      expect(listed.status).toBe(200);
      expect(listed.body.total).toBe(1);
      expect(listed.body.summary).toEqual(
        expect.objectContaining({ averageRating: 4, reviewCount: 1 }),
      );

      const detail = await request(app.getHttpServer()).get(
        `/api/products/${product.id}`,
      );
      expect(detail.body).toEqual(
        expect.objectContaining({ averageRating: 4, reviewCount: 1 }),
      );

      const updated = await request(app.getHttpServer())
        .patch(`/api/reviews/${created.body.id}`)
        .set(bearer(customer.token))
        .send({ rating: 5 });
      expect(updated.body.rating).toBe(5);
      expect(
        (
          await request(app.getHttpServer())
            .patch(`/api/reviews/${created.body.id}`)
            .set(bearer(stranger.token))
            .send({ rating: 1 })
        ).status,
      ).toBe(403);
      // Admins can moderate any review.
      expect(
        (
          await request(app.getHttpServer())
            .delete(`/api/reviews/${created.body.id}`)
            .set(bearer(admin.token))
        ).status,
      ).toBe(204);
    });
    it('sorts products by rating and filters by price', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalog(admin, 5);
      await addToCart(customer, product.id);
      const order = await placeOrder(customer);
      await completeOrder(admin, order.body.id);
      await request(app.getHttpServer())
        .post(`/api/products/${product.id}/reviews`)
        .set(bearer(customer.token))
        .send({ rating: 5 });

      const rated = await request(app.getHttpServer()).get(
        '/api/products?sort=rating_desc&limit=5',
      );
      expect(rated.status).toBe(200);
      expect(rated.body.items[0].id).toBe(product.id);
      expect(rated.body.items[0].averageRating).toBe(5);

      // The catalog product costs 12.50, so this window must exclude it.
      const priced = await request(app.getHttpServer()).get(
        '/api/products?minPrice=100',
      );
      expect(priced.body.total).toBe(0);
    });
  });

  describe('admin stats', () => {
    it('aggregates revenue, statuses, best sellers, and low stock', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalog(admin, 4);
      await addToCart(customer, product.id, 2);
      const order = await placeOrder(customer);
      await completeOrder(admin, order.body.id);

      const stats = await request(app.getHttpServer())
        .get('/api/admin/stats?lowStockThreshold=5')
        .set(bearer(admin.token));
      expect(stats.status).toBe(200);
      // The money-breakdown migration has landed, so merchandise now reports
      // the real line total. The documented invariant must hold on it:
      // merchandise - discounts + shipping === net.
      expect(stats.body.revenue).toEqual(
        expect.objectContaining({
          net: '25.00',
          completed: '25.00',
          cancelled: '0.00',
          merchandise: '25.00',
          discounts: '0.00',
          shipping: '0.00',
        }),
      );
      expect(stats.body.range).toEqual(
        expect.objectContaining({ appliesTo: 'series-only', timezone: 'UTC' }),
      );
      expect(Array.isArray(stats.body.series)).toBe(true);
      expect(stats.body.orders).toEqual(
        expect.objectContaining({
          total: 1,
          countable: 1,
          averageOrderValue: '25.00',
          byStatus: expect.objectContaining({ COMPLETED: 1, PENDING: 0 }),
        }),
      );
      expect(stats.body.topProducts[0]).toEqual(
        expect.objectContaining({ quantitySold: 2, revenue: '25.00' }),
      );
      expect(stats.body.lowStock[0]).toEqual(
        expect.objectContaining({ id: product.id, stock: 2 }),
      );
      expect(
        (
          await request(app.getHttpServer())
            .get('/api/admin/stats')
            .set(bearer(customer.token))
        ).status,
      ).toBe(403);
    });
  });
});
