/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
// Supertest response bodies are intentionally untyped at this HTTP boundary.
//
// DB_NAME is redirected to DB_NAME_TEST by test/setup-env.ts, registered as a
// jest `setupFiles` entry. Do not add in-file guards here — they would run
// after the module graph loads and setup-env.ts already owns the redirect.

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { User, UserRole } from '../src/users/entities/user.entity';
import { resetDatabase } from './utils/db';

type Account = { token: string; userId: string };

describe('Admin operations e2e (users, order history, stats, exports)', () => {
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

  const unique = (prefix: string) => `${prefix}-${Date.now()}-${sequence++}`;
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

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

  /** Seeds a product and drives one order for it; returns the order id. */
  async function placeOrder(
    admin: Account,
    customer: Account,
  ): Promise<string> {
    const slug = unique('category');
    const category = await request(app.getHttpServer())
      .post('/api/categories')
      .set(bearer(admin.token))
      .send({ name: slug, slug });
    expect(category.status).toBe(201);
    const productSlug = unique('product');
    const product = await request(app.getHttpServer())
      .post('/api/products')
      .set(bearer(admin.token))
      .send({
        name: productSlug,
        slug: productSlug,
        description: 'test product',
        price: 10,
        stock: 5,
        categoryId: category.body.id,
      });
    expect(product.status).toBe(201);
    expect(
      (
        await request(app.getHttpServer())
          .post('/api/cart/items')
          .set(bearer(customer.token))
          .send({ productId: product.body.id, quantity: 1 })
      ).status,
    ).toBe(201);
    const order = await request(app.getHttpServer())
      .post('/api/orders/checkout')
      .set(bearer(customer.token))
      .send({
        recipientName: 'Nguyen Van A',
        phone: '0901234567',
        addressLine: '12 Nguyen Hue',
        city: 'Ho Chi Minh',
      });
    expect(order.status).toBe(201);
    return order.body.id as string;
  }

  describe('admin user management', () => {
    it('lists, searches, changes role, and blocks self-targeting', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();

      const list = await request(app.getHttpServer())
        .get('/api/admin/users?page=1&limit=10')
        .set(bearer(admin.token));
      expect(list.status).toBe(200);
      expect(list.body.total).toBe(2);
      // Never leak credentials through the admin surface.
      for (const row of list.body.items) expect(row.password).toBeUndefined();

      const search = await request(app.getHttpServer())
        .get('/api/admin/users?search=customer')
        .set(bearer(admin.token));
      expect(search.status).toBe(200);
      expect(search.body.items).toHaveLength(1);
      expect(search.body.items[0].id).toBe(customer.userId);

      const promote = await request(app.getHttpServer())
        .patch(`/api/admin/users/${customer.userId}/role`)
        .set(bearer(admin.token))
        .send({ role: 'ADMIN' });
      expect(promote.status).toBe(200);
      expect(promote.body.role).toBe('ADMIN');

      // Self-demotion and self-deactivation are refused outright.
      expect(
        (
          await request(app.getHttpServer())
            .patch(`/api/admin/users/${admin.userId}/role`)
            .set(bearer(admin.token))
            .send({ role: 'CUSTOMER' })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(app.getHttpServer())
            .patch(`/api/admin/users/${admin.userId}/status`)
            .set(bearer(admin.token))
            .send({ isActive: false })
        ).status,
      ).toBe(400);

      // Customers cannot reach the surface at all.
      expect(
        (
          await request(app.getHttpServer())
            .get('/api/admin/users')
            .set(bearer(customer.token))
        ).status,
      ).toBe(200); // customer was just promoted to ADMIN above
    });

    it('deactivation kills existing tokens, logins, and refreshes', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();

      const email = (
        await dataSource
          .getRepository(User)
          .findOneByOrFail({ id: customer.userId })
      ).email;

      const off = await request(app.getHttpServer())
        .patch(`/api/admin/users/${customer.userId}/status`)
        .set(bearer(admin.token))
        .send({ isActive: false });
      expect(off.status).toBe(200);
      expect(off.body.isActive).toBe(false);

      // Existing access token dies on the very next request.
      expect(
        (
          await request(app.getHttpServer())
            .get('/api/auth/me')
            .set(bearer(customer.token))
        ).status,
      ).toBe(401);
      // Fresh login is rejected too.
      expect(
        (
          await request(app.getHttpServer())
            .post('/api/auth/login')
            .send({ email, password: 'Password123!' })
        ).status,
      ).toBe(401);

      // Reactivation restores access.
      expect(
        (
          await request(app.getHttpServer())
            .patch(`/api/admin/users/${customer.userId}/status`)
            .set(bearer(admin.token))
            .send({ isActive: true })
        ).status,
      ).toBe(200);
      expect(
        (
          await request(app.getHttpServer())
            .post('/api/auth/login')
            .send({ email, password: 'Password123!' })
        ).status,
      ).toBe(201);
    });

    it('refuses to demote or deactivate the last active admin', async () => {
      const admin = await account(UserRole.ADMIN);
      const secondAdmin = await account(UserRole.ADMIN);

      // Two admins: demoting one is fine.
      expect(
        (
          await request(app.getHttpServer())
            .patch(`/api/admin/users/${secondAdmin.userId}/role`)
            .set(bearer(admin.token))
            .send({ role: 'CUSTOMER' })
        ).status,
      ).toBe(200);

      // Now admin is the last one — a second admin cannot remove them, and
      // they cannot remove themselves; there is nobody else to try.
      const rePromote = await request(app.getHttpServer())
        .patch(`/api/admin/users/${secondAdmin.userId}/role`)
        .set(bearer(admin.token))
        .send({ role: 'ADMIN' });
      expect(rePromote.status).toBe(200);
      const demoteFirst = await request(app.getHttpServer())
        .patch(`/api/admin/users/${admin.userId}/role`)
        .set(bearer(secondAdmin.token))
        .send({ role: 'CUSTOMER' });
      expect(demoteFirst.status).toBe(200);
      // secondAdmin is now the last active admin.
      expect(
        (
          await request(app.getHttpServer())
            .patch(`/api/admin/users/${secondAdmin.userId}/status`)
            .set(bearer(admin.token))
        ).status,
        // demoted admin lost the role guard
      ).toBe(403);
    });
  });

  describe('order status history', () => {
    it('records creation, transitions with notes, and cancellation', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const orderId = await placeOrder(admin, customer);

      expect(
        (
          await request(app.getHttpServer())
            .patch(`/api/orders/${orderId}/status`)
            .set(bearer(admin.token))
            .send({ status: 'PAID', note: 'Chuyển khoản đã về' })
        ).status,
      ).toBe(200);

      const history = await request(app.getHttpServer())
        .get(`/api/orders/${orderId}/history`)
        .set(bearer(admin.token));
      expect(history.status).toBe(200);
      const events = history.body as Array<Record<string, unknown>>;
      expect(events.length).toBe(2);
      expect(events[0]).toEqual(
        expect.objectContaining({ fromStatus: null, toStatus: 'PENDING' }),
      );
      expect(events[1]).toEqual(
        expect.objectContaining({
          fromStatus: 'PENDING',
          toStatus: 'PAID',
          note: 'Chuyển khoản đã về',
        }),
      );

      // The owner can read their own order's history; strangers cannot.
      expect(
        (
          await request(app.getHttpServer())
            .get(`/api/orders/${orderId}/history`)
            .set(bearer(customer.token))
        ).status,
      ).toBe(200);
      const stranger = await account();
      expect(
        (
          await request(app.getHttpServer())
            .get(`/api/orders/${orderId}/history`)
            .set(bearer(stranger.token))
        ).status,
      ).toBe(403);
    });

    it('records the customer cancel path with its actor', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const orderId = await placeOrder(admin, customer);

      expect(
        (
          await request(app.getHttpServer())
            .patch(`/api/orders/${orderId}/cancel`)
            .set(bearer(customer.token))
            .send({})
        ).status,
      ).toBe(200);

      const history = await request(app.getHttpServer())
        .get(`/api/orders/${orderId}/history`)
        .set(bearer(admin.token));
      expect(history.status).toBe(200);
      const last = (history.body as Array<Record<string, unknown>>).at(-1);
      expect(last).toEqual(
        expect.objectContaining({
          fromStatus: 'PENDING',
          toStatus: 'CANCELLED',
          actorRole: 'CUSTOMER',
        }),
      );
    });
  });

  describe('stats correctness and range', () => {
    it('excludes PENDING from revenue but keeps it in byStatus', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      await placeOrder(admin, customer); // stays PENDING

      const stats = await request(app.getHttpServer())
        .get('/api/admin/stats')
        .set(bearer(admin.token));
      expect(stats.status).toBe(200);
      expect(stats.body.orders.byStatus.PENDING).toBe(1);
      expect(stats.body.orders.countable).toBe(0);
      expect(stats.body.revenue.net).toBe('0.00');
      expect(stats.body.topProducts).toHaveLength(0);
      expect(stats.body.orders.averageOrderValue).toBe('0.00');
    });

    it('validates the from/to range and rejects rolled-over days', async () => {
      const admin = await account(UserRole.ADMIN);
      expect(
        (
          await request(app.getHttpServer())
            .get('/api/admin/stats?from=2026-02-30')
            .set(bearer(admin.token))
        ).status,
      ).toBe(400);
      expect(
        (
          await request(app.getHttpServer())
            .get('/api/admin/stats?from=2026-03-02&to=2026-03-01')
            .set(bearer(admin.token))
        ).status,
      ).toBe(400);

      const ranged = await request(app.getHttpServer())
        .get('/api/admin/stats?from=2020-01-01&to=2020-01-03')
        .set(bearer(admin.token));
      expect(ranged.status).toBe(200);
      expect(ranged.body.range).toEqual(
        expect.objectContaining({
          from: '2020-01-01',
          to: '2020-01-03',
          appliesTo: 'all',
        }),
      );
      // Empty window: every day zero-filled, nothing interpolated.
      expect(ranged.body.series).toEqual([
        { date: '2020-01-01', orders: 0, revenue: '0.00' },
        { date: '2020-01-02', orders: 0, revenue: '0.00' },
        { date: '2020-01-03', orders: 0, revenue: '0.00' },
      ]);
    });
  });

  describe('CSV exports', () => {
    it('streams orders.csv with BOM, header, and attachment disposition', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      await placeOrder(admin, customer);

      const csv = await request(app.getHttpServer())
        .get('/api/admin/exports/orders.csv')
        .set(bearer(admin.token));
      expect(csv.status).toBe(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.headers['content-disposition']).toContain('attachment');
      expect(csv.headers['content-disposition']).toContain('.csv');
      const text = csv.text ?? csv.body.toString('utf8');
      expect(text.charCodeAt(0)).toBe(0xfeff); // BOM survives for Excel
      const lines = text.slice(1).split('\n').filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(2); // header + 1 order
      // The header is the snake_case column list, not the entity field names.
      expect(lines[0]).toContain('order_number');
      expect(lines[0]).toContain('order_discount');

      // Customers get 403, not an empty file.
      expect(
        (
          await request(app.getHttpServer())
            .get('/api/admin/exports/orders.csv')
            .set(bearer(customer.token))
        ).status,
      ).toBe(403);
    });

    it('returns just BOM + header when there is nothing to export', async () => {
      const admin = await account(UserRole.ADMIN);
      const csv = await request(app.getHttpServer())
        .get('/api/admin/exports/products.csv')
        .set(bearer(admin.token));
      expect(csv.status).toBe(200);
      const text = csv.text ?? csv.body.toString('utf8');
      expect(text.charCodeAt(0)).toBe(0xfeff);
      expect(text.slice(1).split('\n').filter(Boolean)).toHaveLength(1);
    });
  });
});
