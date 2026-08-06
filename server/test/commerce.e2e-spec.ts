/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
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
import { CouponType } from '../src/coupons/entities/coupon.entity';
import { User, UserRole } from '../src/users/entities/user.entity';
import {
  Payment,
  PaymentStatus,
} from '../src/payments/entities/payment.entity';
import { resetDatabase } from './utils/db';

type Account = { token: string; refreshToken: string; userId: string };

describe('Commerce e2e (addresses, wishlist, coupons, inventory, moderation)', () => {
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

  const api = () => request(app.getHttpServer());
  const unique = (prefix: string) => `${prefix}-${Date.now()}-${sequence++}`;
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function account(role: UserRole = UserRole.CUSTOMER): Promise<Account> {
    const email = `${unique(role.toLowerCase())}@test.local`;
    const password = 'Password123!';
    const register = await api()
      .post('/api/auth/register')
      .send({ email, password, name: role });
    expect(register.status).toBe(201);
    if (role === UserRole.ADMIN)
      await dataSource.getRepository(User).update(register.body.id, { role });
    const login = await api().post('/api/auth/login').send({ email, password });
    expect(login.status).toBe(201);
    return {
      token: login.body.accessToken,
      refreshToken: login.body.refreshToken,
      userId: login.body.user.id,
    };
  }

  async function catalogue(admin: Account, price = '100000.00', stock = 10) {
    const category = await api()
      .post('/api/categories')
      .set(bearer(admin.token))
      .send({ name: 'Root', slug: unique('root') });
    expect(category.status).toBe(201);
    const product = await api()
      .post('/api/products')
      .set(bearer(admin.token))
      .send({
        name: 'Widget',
        slug: unique('widget'),
        description: 'A widget.',
        price: Number(price),
        stock,
        categoryId: category.body.id,
      });
    expect(product.status).toBe(201);
    return { category: category.body, product: product.body };
  }

  const addToCart = (customer: Account, productId: string, quantity = 1) =>
    api()
      .post('/api/cart/items')
      .set(bearer(customer.token))
      .send({ productId, quantity });

  describe('address book', () => {
    it('makes the first address default, promotes on demand, and re-homes the default on delete', async () => {
      const customer = await account();
      const body = {
        recipientName: 'Nguyen Van A',
        phone: '0901234567',
        addressLine: '12 Nguyen Hue',
        city: 'Ho Chi Minh',
      };

      const first = await api()
        .post('/api/addresses')
        .set(bearer(customer.token))
        .send({ ...body, label: 'Nha' });
      expect(first.status).toBe(201);
      // Nothing asked for it: an address book with no default makes checkout
      // pick arbitrarily, so the first entry is promoted automatically.
      expect(first.body.isDefault).toBe(true);

      const second = await api()
        .post('/api/addresses')
        .set(bearer(customer.token))
        .send({ ...body, label: 'Cong ty', addressLine: '9 Le Loi' });
      expect(second.body.isDefault).toBe(false);

      expect(
        (
          await api()
            .patch(`/api/addresses/${second.body.id}/default`)
            .set(bearer(customer.token))
        ).body.isDefault,
      ).toBe(true);
      const afterPromotion = await api()
        .get('/api/addresses')
        .set(bearer(customer.token));
      expect(
        afterPromotion.body.filter((row: any) => row.isDefault),
      ).toHaveLength(1);

      // Deleting the default must leave a default behind, not none.
      expect(
        (
          await api()
            .delete(`/api/addresses/${second.body.id}`)
            .set(bearer(customer.token))
        ).status,
      ).toBe(204);
      const survivors = await api()
        .get('/api/addresses')
        .set(bearer(customer.token));
      expect(survivors.body).toHaveLength(1);
      expect(survivors.body[0].isDefault).toBe(true);
    });

    it('hides another customer address behind a 404', async () => {
      const owner = await account();
      const stranger = await account();
      const address = await api()
        .post('/api/addresses')
        .set(bearer(owner.token))
        .send({
          recipientName: 'Owner',
          phone: '0901234567',
          addressLine: '12 Nguyen Hue',
          city: 'Ho Chi Minh',
        });
      expect(
        (
          await api()
            .get(`/api/addresses/${address.body.id}`)
            .set(bearer(stranger.token))
        ).status,
      ).toBe(404);
    });

    it('ships to a saved address and snapshots it onto the order', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalogue(admin);
      await addToCart(customer, product.id);
      const address = await api()
        .post('/api/addresses')
        .set(bearer(customer.token))
        .send({
          recipientName: 'Nguyen Van A',
          phone: '0901234567',
          addressLine: '12 Nguyen Hue',
          ward: 'Ben Nghe',
          city: 'Ho Chi Minh',
        });

      const order = await api()
        .post('/api/orders/checkout')
        .set(bearer(customer.token))
        .send({ addressId: address.body.id });
      expect(order.status).toBe(201);
      expect(order.body.recipientName).toBe('Nguyen Van A');
      expect(order.body.ward).toBe('Ben Nghe');
      const payment = await dataSource.getRepository(Payment).findOneByOrFail({
        orderId: order.body.id,
      });
      expect(payment.provider).toBe('MANUAL');
      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(payment.amount).toBe(order.body.totalAmount);

      // Editing the book afterwards must not rewrite delivery history.
      await api()
        .patch(`/api/addresses/${address.body.id}`)
        .set(bearer(customer.token))
        .send({ recipientName: 'Someone Else' });
      const reloaded = await api()
        .get(`/api/orders/${order.body.id}`)
        .set(bearer(customer.token));
      expect(reloaded.body.recipientName).toBe('Nguyen Van A');
    });
  });

  describe('wishlist', () => {
    it('saves idempotently, moves to the cart, and refuses an unknown product', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalogue(admin);

      const saved = await api()
        .post('/api/wishlist')
        .set(bearer(customer.token))
        .send({ productId: product.id });
      expect(saved.status).toBe(201);
      expect(saved.body).toHaveLength(1);
      expect(saved.body[0].inStock).toBe(true);

      // Saving the same product twice is a no-op, not a 409.
      const again = await api()
        .post('/api/wishlist')
        .set(bearer(customer.token))
        .send({ productId: product.id });
      expect(again.status).toBe(201);
      expect(again.body).toHaveLength(1);

      const moved = await api()
        .post(`/api/wishlist/${product.id}/move-to-cart`)
        .set(bearer(customer.token))
        .send({ quantity: 2 });
      expect(moved.status).toBe(201);
      expect(moved.body.items[0].quantity).toBe(2);
      expect(
        (await api().get('/api/wishlist').set(bearer(customer.token))).body,
      ).toHaveLength(0);

      expect(
        (
          await api()
            .post('/api/wishlist')
            .set(bearer(customer.token))
            .send({ productId: '11111111-1111-4111-8111-111111111111' })
        ).status,
      ).toBe(404);
    });

    it('keeps the product saved when the move to cart fails on stock', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalogue(admin, '100000.00', 1);
      await api()
        .post('/api/wishlist')
        .set(bearer(customer.token))
        .send({ productId: product.id });

      const moved = await api()
        .post(`/api/wishlist/${product.id}/move-to-cart`)
        .set(bearer(customer.token))
        .send({ quantity: 5 });
      expect(moved.status).toBe(400);
      // The other order of operations would leave the customer with neither.
      expect(
        (await api().get('/api/wishlist').set(bearer(customer.token))).body,
      ).toHaveLength(1);
    });
  });

  describe('coupons', () => {
    async function coupon(admin: Account, overrides: Record<string, unknown>) {
      const created = await api()
        .post('/api/admin/coupons')
        .set(bearer(admin.token))
        .send({
          code: unique('SALE')
            .toUpperCase()
            .replace(/[^A-Z0-9_-]/g, '-'),
          type: CouponType.PERCENT,
          value: 10,
          ...overrides,
        });
      expect(created.status).toBe(201);
      return created.body;
    }

    it('previews a discount without reserving it', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalogue(admin, '200000.00');
      await addToCart(customer, product.id, 2);
      const created = await coupon(admin, { value: 25 });

      const preview = await api()
        .post('/api/coupons/preview')
        .set(bearer(customer.token))
        .send({ code: created.code });
      expect(preview.status).toBe(200);
      expect(preview.body.subtotal).toBe('400000.00');
      expect(preview.body.discount).toBe('100000.00');
      expect(preview.body.payable).toBe('300000.00');
      // Customers must not learn how much budget a code has left.
      expect(preview.body.coupon).not.toHaveProperty('usageCount');
      expect(preview.body.coupon).not.toHaveProperty('usageLimit');

      // A preview reserves nothing.
      expect(
        (
          await api()
            .get(`/api/admin/coupons/${created.id}`)
            .set(bearer(admin.token))
        ).body.usageCount,
      ).toBe(0);
    });

    it('applies at checkout, keeps the money invariant, and records the redemption', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalogue(admin, '200000.00');
      await addToCart(customer, product.id, 2);
      const created = await coupon(admin, {
        type: CouponType.FIXED,
        value: 50000,
      });

      const order = await api()
        .post('/api/orders/checkout')
        .set(bearer(customer.token))
        .send({
          recipientName: 'Nguyen Van A',
          phone: '0901234567',
          addressLine: '12 Nguyen Hue',
          city: 'Ho Chi Minh',
          couponCode: created.code,
        });
      expect(order.status).toBe(201);
      expect(order.body.subtotalAmount).toBe('400000.00');
      expect(order.body.discountAmount).toBe('50000.00');
      expect(order.body.couponCode).toBe(created.code);
      // total = subtotal - discount + shipping, to the cent.
      expect(order.body.totalAmount).toBe('350000.00');
      expect(order.body.paymentMethod).toBe('COD');

      expect(
        (
          await api()
            .get(`/api/admin/coupons/${created.id}`)
            .set(bearer(admin.token))
        ).body.usageCount,
      ).toBe(1);
    });

    it('returns the budget when the order is cancelled', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalogue(admin, '200000.00');
      await addToCart(customer, product.id);
      const created = await coupon(admin, { usageLimit: 1, perUserLimit: 1 });

      const order = await api()
        .post('/api/orders/checkout')
        .set(bearer(customer.token))
        .send({
          recipientName: 'Nguyen Van A',
          phone: '0901234567',
          addressLine: '12 Nguyen Hue',
          city: 'Ho Chi Minh',
          couponCode: created.code,
        });
      expect(order.status).toBe(201);

      await api()
        .patch(`/api/orders/${order.body.id}/cancel`)
        .set(bearer(customer.token))
        .send({});
      expect(
        (
          await api()
            .get(`/api/admin/coupons/${created.id}`)
            .set(bearer(admin.token))
        ).body.usageCount,
      ).toBe(0);

      // The freed redemption is genuinely reusable, not just a decremented number.
      await addToCart(customer, product.id);
      expect(
        (
          await api()
            .post('/api/coupons/preview')
            .set(bearer(customer.token))
            .send({ code: created.code })
        ).status,
      ).toBe(200);
    });

    it('refuses an exhausted, expired, or under-minimum code with the reason', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalogue(admin, '100000.00');
      await addToCart(customer, product.id);

      const expired = await coupon(admin, {
        startsAt: '2020-01-01T00:00:00.000Z',
        endsAt: '2020-02-01T00:00:00.000Z',
      });
      const tooSmall = await coupon(admin, { minSubtotal: 500000 });
      const disabled = await coupon(admin, { isActive: false });

      const reasons = await Promise.all(
        [expired, tooSmall, disabled].map(async (row) => {
          const response = await api()
            .post('/api/coupons/preview')
            .set(bearer(customer.token))
            .send({ code: row.code });
          expect(response.status).toBe(400);
          return response.body.message;
        }),
      );
      expect(reasons[0]).toBe('Coupon has expired');
      expect(reasons[1]).toContain('Order subtotal must be at least');
      expect(reasons[2]).toBe('Coupon is not available');
    });

    it('refuses to delete a redeemed coupon so the ledger stays explainable', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalogue(admin, '200000.00');
      await addToCart(customer, product.id);
      const created = await coupon(admin, {});
      await api()
        .post('/api/orders/checkout')
        .set(bearer(customer.token))
        .send({
          recipientName: 'Nguyen Van A',
          phone: '0901234567',
          addressLine: '12 Nguyen Hue',
          city: 'Ho Chi Minh',
          couponCode: created.code,
        });
      const deleted = await api()
        .delete(`/api/admin/coupons/${created.id}`)
        .set(bearer(admin.token));
      expect(deleted.status).toBe(409);
    });

    it('keeps the coupon surface admin-only', async () => {
      const customer = await account();
      expect(
        (await api().get('/api/admin/coupons').set(bearer(customer.token)))
          .status,
      ).toBe(403);
    });
  });

  describe('catalogue publication and hierarchy', () => {
    it('hides an unpublished product from the storefront but not from admins', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalogue(admin);

      await api()
        .patch(`/api/products/${product.id}`)
        .set(bearer(admin.token))
        .send({ isActive: false });

      expect((await api().get(`/api/products/${product.id}`)).status).toBe(404);
      const listed = await api().get('/api/products');
      expect(
        listed.body.items.filter((row: any) => row.id === product.id),
      ).toHaveLength(0);
      // Admins still need to find it in order to publish it again.
      expect(
        (
          await api()
            .get(`/api/admin/products/${product.id}`)
            .set(bearer(admin.token))
        ).status,
      ).toBe(200);
      expect(
        (
          await api()
            .get('/api/admin/products?isActive=false')
            .set(bearer(admin.token))
        ).body.items,
      ).toHaveLength(1);

      // And it can no longer be bought.
      expect((await addToCart(customer, product.id)).status).toBe(400);
    });

    it('refuses checkout for a product unpublished while it sat in the cart', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalogue(admin);
      await addToCart(customer, product.id);
      await api()
        .patch(`/api/products/${product.id}`)
        .set(bearer(admin.token))
        .send({ isActive: false });

      const checkout = await api()
        .post('/api/orders/checkout')
        .set(bearer(customer.token))
        .send({
          recipientName: 'Nguyen Van A',
          phone: '0901234567',
          addressLine: '12 Nguyen Hue',
          city: 'Ho Chi Minh',
        });
      expect(checkout.status).toBe(409);
      // "No longer sold" and "only 2 left" are different problems.
      expect(checkout.body.items[0].reason).toBe('unavailable');
    });

    it('nests categories, counts products, and refuses a cycle', async () => {
      const admin = await account(UserRole.ADMIN);
      const parent = await api()
        .post('/api/categories')
        .set(bearer(admin.token))
        .send({ name: 'Electronics', slug: unique('electronics') });
      const child = await api()
        .post('/api/categories')
        .set(bearer(admin.token))
        .send({
          name: 'Laptops',
          slug: unique('laptops'),
          parentId: parent.body.id,
        });
      expect(child.status).toBe(201);

      await api()
        .post('/api/products')
        .set(bearer(admin.token))
        .send({
          name: 'Laptop',
          slug: unique('laptop'),
          description: 'A laptop.',
          price: 1000,
          stock: 3,
          categoryId: child.body.id,
        });

      const tree = await api().get('/api/categories/tree');
      expect(tree.status).toBe(200);
      const root = tree.body.find((node: any) => node.id === parent.body.id);
      expect(root.children.map((node: any) => node.id)).toEqual([
        child.body.id,
      ]);
      expect(root.productCount).toBe(0);
      expect(root.children[0].productCount).toBe(1);

      // The parent alone has no products; widened, it inherits the child's.
      expect(
        (await api().get(`/api/products?categoryId=${parent.body.id}`)).body
          .total,
      ).toBe(0);
      expect(
        (
          await api().get(
            `/api/products?categoryId=${parent.body.id}&includeDescendants=true`,
          )
        ).body.total,
      ).toBe(1);

      // Moving a category under its own descendant would detach the branch.
      expect(
        (
          await api()
            .patch(`/api/categories/${parent.body.id}`)
            .set(bearer(admin.token))
            .send({ parentId: child.body.id })
        ).status,
      ).toBe(400);
      expect(
        (
          await api()
            .delete(`/api/categories/${parent.body.id}`)
            .set(bearer(admin.token))
        ).status,
      ).toBe(409);
    });

    it('serves a product by slug and suggests in-stock siblings', async () => {
      const admin = await account(UserRole.ADMIN);
      const { category, product } = await catalogue(admin);
      const sibling = await api()
        .post('/api/products')
        .set(bearer(admin.token))
        .send({
          name: 'Sibling',
          slug: unique('sibling'),
          description: 'Another widget.',
          price: 50,
          stock: 4,
          categoryId: category.id,
        });
      const soldOut = await api()
        .post('/api/products')
        .set(bearer(admin.token))
        .send({
          name: 'Sold out',
          slug: unique('sold-out'),
          description: 'None left.',
          price: 50,
          stock: 0,
          categoryId: category.id,
        });

      const bySlug = await api().get(`/api/products/slug/${product.slug}`);
      expect(bySlug.status).toBe(200);
      expect(bySlug.body.id).toBe(product.id);

      const related = await api().get(`/api/products/${product.id}/related`);
      expect(related.status).toBe(200);
      const ids = related.body.map((row: any) => row.id);
      expect(ids).toContain(sibling.body.id);
      // Suggesting something unbuyable helps nobody.
      expect(ids).not.toContain(soldOut.body.id);
      expect(ids).not.toContain(product.id);
    });

    it('rejects a duplicate SKU', async () => {
      const admin = await account(UserRole.ADMIN);
      const { category } = await catalogue(admin);
      const body = {
        description: 'A widget.',
        price: 10,
        stock: 1,
        categoryId: category.id,
        sku: 'DUP-001',
      };
      expect(
        (
          await api()
            .post('/api/products')
            .set(bearer(admin.token))
            .send({ ...body, name: 'One', slug: unique('one') })
        ).status,
      ).toBe(201);
      expect(
        (
          await api()
            .post('/api/products')
            .set(bearer(admin.token))
            .send({ ...body, name: 'Two', slug: unique('two') })
        ).status,
      ).toBe(409);
    });
  });

  describe('stock ledger', () => {
    it('records a sale, a cancellation, and a manual adjustment', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalogue(admin, '100000.00', 10);
      await addToCart(customer, product.id, 3);
      const order = await api()
        .post('/api/orders/checkout')
        .set(bearer(customer.token))
        .send({
          recipientName: 'Nguyen Van A',
          phone: '0901234567',
          addressLine: '12 Nguyen Hue',
          city: 'Ho Chi Minh',
        });
      expect(order.status).toBe(201);
      await api()
        .patch(`/api/orders/${order.body.id}/cancel`)
        .set(bearer(customer.token))
        .send({});

      const adjusted = await api()
        .patch(`/api/products/${product.id}/stock`)
        .set(bearer(admin.token))
        .send({ stock: 25, reason: 'RESTOCK', note: 'Nhap hang' });
      expect(adjusted.status).toBe(200);
      expect(adjusted.body.stock).toBe(25);

      const ledger = await api()
        .get(`/api/admin/stock-movements?productId=${product.id}`)
        .set(bearer(admin.token));
      expect(ledger.status).toBe(200);
      // Newest first: restock (+15 to 25), cancellation (+3 to 10), sale (-3 to 7).
      expect(
        ledger.body.items.map((row: any) => [
          row.reason,
          row.delta,
          row.balanceAfter,
        ]),
      ).toEqual([
        ['RESTOCK', 15, 25],
        ['CANCELLATION', 3, 10],
        ['SALE', -3, 7],
      ]);
      expect(ledger.body.items[0].note).toBe('Nhap hang');
    });

    it('is idempotent because the adjustment is absolute, not a delta', async () => {
      const admin = await account(UserRole.ADMIN);
      const { product } = await catalogue(admin, '100000.00', 10);
      const body = { stock: 7 };
      await api()
        .patch(`/api/products/${product.id}/stock`)
        .set(bearer(admin.token))
        .send(body);
      const retried = await api()
        .patch(`/api/products/${product.id}/stock`)
        .set(bearer(admin.token))
        .send(body);
      expect(retried.body.stock).toBe(7);

      // The retry changed nothing, so it must not have written a ledger row.
      const ledger = await api()
        .get(`/api/admin/stock-movements?productId=${product.id}`)
        .set(bearer(admin.token));
      expect(ledger.body.total).toBe(1);
    });
  });

  describe('review moderation and helpful votes', () => {
    async function reviewableProduct() {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalogue(admin, '100000.00', 10);
      await addToCart(customer, product.id);
      const order = await api()
        .post('/api/orders/checkout')
        .set(bearer(customer.token))
        .send({
          recipientName: 'Nguyen Van A',
          phone: '0901234567',
          addressLine: '12 Nguyen Hue',
          city: 'Ho Chi Minh',
        });
      for (const status of ['PAID', 'SHIPPED', 'COMPLETED'])
        await api()
          .patch(`/api/orders/${order.body.id}/status`)
          .set(bearer(admin.token))
          .send({ status });
      const review = await api()
        .post(`/api/products/${product.id}/reviews`)
        .set(bearer(customer.token))
        .send({ rating: 5, comment: 'Tot' });
      expect(review.status).toBe(201);
      return { admin, customer, product, review: review.body };
    }

    it('hides a review from the list and from the rating average', async () => {
      const { admin, customer, product, review } = await reviewableProduct();
      expect(
        (await api().get(`/api/products/${product.id}/reviews`)).body.summary
          .averageRating,
      ).toBe(5);

      const hidden = await api()
        .patch(`/api/reviews/${review.id}/visibility`)
        .set(bearer(admin.token))
        .send({ isHidden: true });
      expect(hidden.status).toBe(200);
      expect(hidden.body.isHidden).toBe(true);

      const listed = await api().get(`/api/products/${product.id}/reviews`);
      expect(listed.body.total).toBe(0);
      // A moderated review must stop moving the score, not just vanish.
      expect(listed.body.summary.averageRating).toBe(0);
      expect(listed.body.summary.reviewCount).toBe(0);
      expect(
        (await api().get(`/api/products/${product.id}`)).body.reviewCount,
      ).toBe(0);

      // The author can still see what happened to their review.
      const mine = await api()
        .get(`/api/products/${product.id}/reviews/mine`)
        .set(bearer(customer.token));
      expect(mine.body.isHidden).toBe(true);

      const restored = await api()
        .patch(`/api/reviews/${review.id}/visibility`)
        .set(bearer(admin.token))
        .send({ isHidden: false });
      expect(restored.body.isHidden).toBe(false);
      expect(
        (await api().get(`/api/products/${product.id}/reviews`)).body.total,
      ).toBe(1);
    });

    it('counts a helpful vote once and refuses self-votes', async () => {
      const { customer, review } = await reviewableProduct();
      const voter = await account();

      const voted = await api()
        .post(`/api/reviews/${review.id}/helpful`)
        .set(bearer(voter.token));
      expect(voted.status).toBe(200);
      expect(voted.body.helpfulCount).toBe(1);

      // A double-tapped button must not inflate the ranking.
      expect(
        (
          await api()
            .post(`/api/reviews/${review.id}/helpful`)
            .set(bearer(voter.token))
        ).body.helpfulCount,
      ).toBe(1);

      expect(
        (
          await api()
            .post(`/api/reviews/${review.id}/helpful`)
            .set(bearer(customer.token))
        ).status,
      ).toBe(403);

      expect(
        (
          await api()
            .delete(`/api/reviews/${review.id}/helpful`)
            .set(bearer(voter.token))
        ).body.helpfulCount,
      ).toBe(0);
      // A repeated un-vote must not drive the counter negative.
      expect(
        (
          await api()
            .delete(`/api/reviews/${review.id}/helpful`)
            .set(bearer(voter.token))
        ).body.helpfulCount,
      ).toBe(0);
    });

    it('lists the moderation queue for admins only', async () => {
      const { admin, customer, review } = await reviewableProduct();
      await api()
        .patch(`/api/reviews/${review.id}/visibility`)
        .set(bearer(admin.token))
        .send({ isHidden: true });

      const queue = await api()
        .get('/api/admin/reviews?isHidden=true')
        .set(bearer(admin.token));
      expect(queue.status).toBe(200);
      expect(queue.body.total).toBe(1);
      expect(queue.body.items[0].productName).toBe('Widget');
      expect(
        (await api().get('/api/admin/reviews').set(bearer(customer.token)))
          .status,
      ).toBe(403);
    });
  });

  describe('sessions and refresh rotation', () => {
    it('rotates the refresh token and forgives a same-instant race', async () => {
      const customer = await account();

      const rotated = await api()
        .post('/api/auth/refresh')
        .send({ refreshToken: customer.refreshToken });
      expect(rotated.status).toBe(201);
      expect(rotated.body.refreshToken).not.toBe(customer.refreshToken);
      expect(rotated.body.accessToken).toBeDefined();

      // Two tabs refreshing at the same moment both present the token the
      // other just consumed. Inside the grace window that is a client race,
      // not a theft, and logging the user out of every device would be wrong.
      const raced = await api()
        .post('/api/auth/refresh')
        .send({ refreshToken: customer.refreshToken });
      expect(raced.status).toBe(201);
    });

    it('revokes the whole family when a retired token is replayed later', async () => {
      const customer = await account();
      const rotated = await api()
        .post('/api/auth/refresh')
        .send({ refreshToken: customer.refreshToken });
      expect(rotated.status).toBe(201);

      // Age the rotation past the grace window. The alternative is a 30-second
      // sleep in the suite, which buys nothing the clock shift does not.
      await dataSource.query(
        'UPDATE `refresh_sessions` SET `revoked_at` = DATE_SUB(`revoked_at`, INTERVAL 10 MINUTE) WHERE `revoked_at` IS NOT NULL',
      );

      // Now the same token is the signature of a stolen credential being used
      // alongside the legitimate one, so the whole chain dies — including the
      // healthy token that replaced it, which the thief may also hold.
      expect(
        (
          await api()
            .post('/api/auth/refresh')
            .send({ refreshToken: customer.refreshToken })
        ).status,
      ).toBe(401);
      expect(
        (
          await api()
            .post('/api/auth/refresh')
            .send({ refreshToken: rotated.body.refreshToken })
        ).status,
      ).toBe(401);
    });

    it('lists live sessions, flags the current one, and ends them', async () => {
      const customer = await account();
      const second = await api()
        .post('/api/auth/login')
        .send({
          email: (await currentEmail(customer)).email,
          password: 'Password123!',
        });
      expect(second.status).toBe(201);

      const sessions = await api()
        .get('/api/auth/sessions')
        .set(bearer(customer.token));
      expect(sessions.status).toBe(200);
      expect(sessions.body).toHaveLength(2);
      expect(sessions.body.filter((row: any) => row.current)).toHaveLength(1);
      // The one column that must never leave the server, even to its owner.
      expect(sessions.body[0]).not.toHaveProperty('tokenHash');

      expect(
        (
          await api()
            .post('/api/auth/logout')
            .set(bearer(customer.token))
            .send({ refreshToken: second.body.refreshToken })
        ).status,
      ).toBe(204);
      expect(
        (
          await api()
            .post('/api/auth/refresh')
            .send({ refreshToken: second.body.refreshToken })
        ).status,
      ).toBe(401);
      expect(
        (await api().get('/api/auth/sessions').set(bearer(customer.token)))
          .body,
      ).toHaveLength(1);

      expect(
        (await api().post('/api/auth/logout-all').set(bearer(customer.token)))
          .status,
      ).toBe(204);
      expect(
        (await api().get('/api/auth/sessions').set(bearer(customer.token)))
          .body,
      ).toHaveLength(0);
    });

    it('changes the password, kills old sessions, and returns a working pair', async () => {
      const customer = await account();
      const { email } = await currentEmail(customer);

      const changed = await api()
        .patch('/api/auth/password')
        .set(bearer(customer.token))
        .send({
          currentPassword: 'Password123!',
          newPassword: 'NewPassword456!',
        });
      expect(changed.status).toBe(200);
      expect(changed.body.accessToken).toBeDefined();

      // The old refresh token dies with the old password.
      expect(
        (
          await api()
            .post('/api/auth/refresh')
            .send({ refreshToken: customer.refreshToken })
        ).status,
      ).toBe(401);
      // The pair handed back works, so the request does not log itself out.
      expect(
        (
          await api()
            .post('/api/auth/refresh')
            .send({ refreshToken: changed.body.refreshToken })
        ).status,
      ).toBe(201);
      expect(
        (
          await api()
            .post('/api/auth/login')
            .send({ email, password: 'Password123!' })
        ).status,
      ).toBe(401);
      expect(
        (
          await api()
            .post('/api/auth/login')
            .send({ email, password: 'NewPassword456!' })
        ).status,
      ).toBe(201);
    });

    it('rejects a wrong current password and updates the display name', async () => {
      const customer = await account();
      expect(
        (
          await api()
            .patch('/api/auth/password')
            .set(bearer(customer.token))
            .send({ currentPassword: 'WrongPass1!', newPassword: 'Another1!' })
        ).status,
      ).toBe(401);

      const profile = await api()
        .patch('/api/auth/profile')
        .set(bearer(customer.token))
        .send({ name: 'Nguyen Van B' });
      expect(profile.status).toBe(200);
      expect(profile.body.name).toBe('Nguyen Van B');
      expect(
        (await api().get('/api/auth/me').set(bearer(customer.token))).body.name,
      ).toBe('Nguyen Van B');
    });

    it('drops every refresh session when the account is deactivated', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      await api()
        .patch(`/api/admin/users/${customer.userId}/status`)
        .set(bearer(admin.token))
        .send({ isActive: false });

      // The access token dies on the next request; the seven-day refresh token
      // would otherwise outlive the deactivation entirely.
      expect(
        (
          await api()
            .post('/api/auth/refresh')
            .send({ refreshToken: customer.refreshToken })
        ).status,
      ).toBe(401);
    });

    async function currentEmail(customer: Account): Promise<{ email: string }> {
      const user = await dataSource
        .getRepository(User)
        .findOneByOrFail({ id: customer.userId });
      return { email: user.email };
    }
  });

  describe('back-in-stock alerts', () => {
    it('fires when stock crosses zero, then clears the subscription', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalogue(admin, '100000.00', 0);

      const watched = await api()
        .post(`/api/products/${product.id}/stock-alert`)
        .set(bearer(customer.token));
      expect(watched.status).toBe(201);
      expect(watched.body).toHaveLength(1);

      // Restocking through the audited route is what should trigger the sweep:
      // the hook hangs off the stock ledger, not off any one caller.
      expect(
        (
          await api()
            .patch(`/api/products/${product.id}/stock`)
            .set(bearer(admin.token))
            .send({ stock: 5, reason: 'RESTOCK' })
        ).status,
      ).toBe(200);

      const inbox = await api()
        .get('/api/notifications')
        .set(bearer(customer.token));
      expect(inbox.status).toBe(200);
      expect(
        inbox.body.items.filter((row: any) => row.type === 'STOCK_BACK'),
      ).toHaveLength(1);

      // The subscription is spent, not flagged — so it can be taken again the
      // next time the product sells out.
      expect(
        (await api().get('/api/stock-alerts').set(bearer(customer.token))).body,
      ).toHaveLength(0);
    });

    it('refuses to watch a product that is already on the shelf', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalogue(admin, '100000.00', 3);
      const watched = await api()
        .post(`/api/products/${product.id}/stock-alert`)
        .set(bearer(customer.token));
      expect(watched.status).toBe(400);
    });

    it('does not notify a restock of something that never ran out', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalogue(admin, '100000.00', 0);
      await api()
        .post(`/api/products/${product.id}/stock-alert`)
        .set(bearer(customer.token));
      // 0 -> 4 crosses and clears the queue; 4 -> 9 must stay silent.
      await api()
        .patch(`/api/products/${product.id}/stock`)
        .set(bearer(admin.token))
        .send({ stock: 4, reason: 'RESTOCK' });
      await api()
        .patch(`/api/products/${product.id}/stock`)
        .set(bearer(admin.token))
        .send({ stock: 9, reason: 'RESTOCK' });

      const inbox = await api()
        .get('/api/notifications')
        .set(bearer(customer.token));
      expect(
        inbox.body.items.filter((row: any) => row.type === 'STOCK_BACK'),
      ).toHaveLength(1);
    });
  });

  describe('bulk product operations', () => {
    async function threeProducts(admin: Account) {
      const { category, product } = await catalogue(admin, '100000.00', 5);
      const others = [];
      for (const price of [200000, 300000]) {
        const created = await api()
          .post('/api/products')
          .set(bearer(admin.token))
          .send({
            name: `Bulk ${price}`,
            slug: unique('bulk'),
            description: 'Bulk target.',
            price,
            stock: 5,
            categoryId: category.id,
          });
        expect(created.status).toBe(201);
        others.push(created.body);
      }
      return {
        category,
        ids: [product.id, ...others.map((row: any) => row.id)],
      };
    }

    it('unpublishes a selection and reports ids that matched nothing', async () => {
      const admin = await account(UserRole.ADMIN);
      const { ids } = await threeProducts(admin);
      const ghost = '11111111-1111-4111-8111-111111111111';

      const result = await api()
        .patch('/api/admin/products/bulk/visibility')
        .set(bearer(admin.token))
        .send({ productIds: [...ids, ghost], isActive: false });
      expect(result.status).toBe(200);
      expect(result.body.updated).toBe(3);
      // A stale id must be surfaced, not silently dropped.
      expect(result.body.skipped).toEqual([
        { productId: ghost, reason: 'not-found' },
      ]);
      expect((await api().get('/api/products')).body.total).toBe(0);
    });

    it('re-prices by percent and skips only the products that cannot move', async () => {
      const admin = await account(UserRole.ADMIN);
      const { category } = await catalogue(admin, '100000.00', 5);
      const cheap = await api()
        .post('/api/products')
        .set(bearer(admin.token))
        .send({
          name: 'Cheap',
          slug: unique('cheap'),
          description: 'One cent.',
          price: 0.01,
          stock: 1,
          categoryId: category.id,
        });
      const dear = await api()
        .post('/api/products')
        .set(bearer(admin.token))
        .send({
          name: 'Dear',
          slug: unique('dear'),
          description: 'Normal.',
          price: 500000,
          stock: 1,
          categoryId: category.id,
        });

      const result = await api()
        .patch('/api/admin/products/bulk/price')
        .set(bearer(admin.token))
        .send({
          productIds: [cheap.body.id, dear.body.id],
          mode: 'AMOUNT',
          value: -0.01,
        });
      expect(result.status).toBe(200);
      // Taking a cent off a one-cent product lands on zero, which the column
      // cannot hold: it is reported rather than silently clamped, and the
      // other product still moves.
      expect(result.body.updated).toBe(1);
      expect(result.body.skipped).toEqual([
        { productId: cheap.body.id, reason: 'below-minimum' },
      ]);
      expect(
        (
          await api()
            .get(`/api/admin/products/${dear.body.id}`)
            .set(bearer(admin.token))
        ).body.price,
      ).toBe('499999.99');
      expect(
        (
          await api()
            .get(`/api/admin/products/${cheap.body.id}`)
            .set(bearer(admin.token))
        ).body.price,
      ).toBe('0.01');
    });

    it('keeps the bulk surface admin-only', async () => {
      const customer = await account();
      expect(
        (
          await api()
            .patch('/api/admin/products/bulk/visibility')
            .set(bearer(customer.token))
            .send({ productIds: [], isActive: false })
        ).status,
      ).toBe(403);
    });
  });

  describe('search suggestions', () => {
    it('ranks a prefix match above a mere containment and hides unpublished', async () => {
      const admin = await account(UserRole.ADMIN);
      const { category } = await catalogue(admin, '100000.00', 5);
      const make = (name: string, isActive = true) =>
        api()
          .post('/api/products')
          .set(bearer(admin.token))
          .send({
            name,
            slug: unique('sug'),
            description: 'Suggest target.',
            price: 1000,
            stock: 1,
            categoryId: category.id,
            isActive,
          });
      await make('Tai nghe khong day');
      await make('Ban phim tai tho');
      await make('Tai nghe an chua ban', false);

      const suggested = await api().get('/api/products/suggest?q=tai');
      expect(suggested.status).toBe(200);
      const names = suggested.body.map((row: any) => row.name);
      // Prefix first, and the unpublished product must not appear at all.
      expect(names[0]).toBe('Tai nghe khong day');
      expect(names).toContain('Ban phim tai tho');
      expect(names).not.toContain('Tai nghe an chua ban');
      // A narrow projection: no description shipped on every keystroke.
      expect(suggested.body[0]).not.toHaveProperty('description');
    });

    it('returns nothing for a term too short to be worth a query', async () => {
      const admin = await account(UserRole.ADMIN);
      await catalogue(admin);
      expect((await api().get('/api/products/suggest?q=a')).body).toEqual([]);
      expect((await api().get('/api/products/suggest')).body).toEqual([]);
    });
  });

  describe('product gallery and tags', () => {
    it('mirrors the primary gallery image into the legacy imageUrl', async () => {
      const admin = await account(UserRole.ADMIN);
      const { product } = await catalogue(admin);

      const first = await api()
        .post(`/api/products/${product.id}/images`)
        .set(bearer(admin.token))
        .send({ url: 'https://example.test/a.jpg', altText: 'A' });
      expect(first.status).toBe(201);
      const detail = await api().get(`/api/products/${product.id}`);
      // The first image elects itself primary, and the legacy field follows it
      // so clients that only read imageUrl never see an empty product.
      expect(detail.body.images).toHaveLength(1);
      expect(detail.body.images[0].isPrimary).toBe(true);
      expect(detail.body.imageUrl).toBe('https://example.test/a.jpg');

      const second = await api()
        .post(`/api/products/${product.id}/images`)
        .set(bearer(admin.token))
        .send({ url: 'https://example.test/b.jpg' });
      expect(second.status).toBe(201);

      await api()
        .patch(`/api/products/${product.id}/images/${second.body.id}`)
        .set(bearer(admin.token))
        .send({ isPrimary: true });
      const promoted = await api().get(`/api/products/${product.id}`);
      const primary = promoted.body.images.find((row: any) => row.isPrimary);
      // Exactly one primary survives a promotion, and the mirror follows.
      expect(
        promoted.body.images.filter((row: any) => row.isPrimary),
      ).toHaveLength(1);
      expect(promoted.body.imageUrl).toBe(primary.url);
    });

    it('narrows on every tag rather than any of them', async () => {
      const admin = await account(UserRole.ADMIN);
      const { category } = await catalogue(admin);
      const sale = await api()
        .post('/api/tags')
        .set(bearer(admin.token))
        .send({ name: 'Sale' });
      const nou = await api()
        .post('/api/tags')
        .set(bearer(admin.token))
        .send({ name: 'Moi' });
      expect(sale.status).toBe(201);

      const make = async (name: string, tagIds: string[]) => {
        const created = await api()
          .post('/api/products')
          .set(bearer(admin.token))
          .send({
            name,
            slug: unique('tagged'),
            description: 'Tagged.',
            price: 1000,
            stock: 1,
            categoryId: category.id,
          });
        await api()
          .put(`/api/products/${created.body.id}/tags`)
          .set(bearer(admin.token))
          .send({ tagIds });
        return created.body;
      };
      const both = await make('Both tags', [sale.body.id, nou.body.id]);
      await make('Only sale', [sale.body.id]);

      const onlyOne = await api().get(`/api/products?tags=${sale.body.slug}`);
      expect(onlyOne.body.total).toBe(2);
      // A second tag must show FEWER results; ANY-semantics would show more.
      const bothTags = await api().get(
        `/api/products?tags=${sale.body.slug},${nou.body.slug}`,
      );
      expect(bothTags.body.total).toBe(1);
      expect(bothTags.body.items[0].id).toBe(both.id);
    });
  });

  describe('available coupons', () => {
    it('lists only published codes the cart qualifies for, best first', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalogue(admin, '200000.00', 10);
      await addToCart(customer, product.id, 2);

      const make = (overrides: Record<string, unknown>) =>
        api()
          .post('/api/admin/coupons')
          .set(bearer(admin.token))
          .send({
            code: unique('OFFER')
              .toUpperCase()
              .replace(/[^A-Z0-9_-]/g, '-'),
            type: CouponType.FIXED,
            value: 10000,
            ...overrides,
          });

      const small = await make({ isPublic: true, value: 10000 });
      const big = await make({ isPublic: true, value: 50000 });
      const targeted = await make({ isPublic: false, value: 90000 });
      const tooBigCart = await make({ isPublic: true, minSubtotal: 9000000 });

      const offers = await api()
        .get('/api/coupons/available')
        .set(bearer(customer.token));
      expect(offers.status).toBe(200);
      const codes = offers.body.map((row: any) => row.coupon.code);

      // Best discount first.
      expect(codes[0]).toBe(big.body.code);
      expect(codes).toContain(small.body.code);
      // A targeted code must never be advertised — that is the whole point of
      // the flag defaulting to false.
      expect(codes).not.toContain(targeted.body.code);
      // Nor one the cart does not qualify for: offering it then refusing it at
      // the till would be worse than not offering it.
      expect(codes).not.toContain(tooBigCart.body.code);
      expect(offers.body[0].discount).toBe('50000.00');
    });

    it('offers nothing when the cart is empty', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      await catalogue(admin);
      await api()
        .post('/api/admin/coupons')
        .set(bearer(admin.token))
        .send({
          code: unique('EMPTY')
            .toUpperCase()
            .replace(/[^A-Z0-9_-]/g, '-'),
          type: CouponType.PERCENT,
          value: 10,
          isPublic: true,
        });
      const offers = await api()
        .get('/api/coupons/available')
        .set(bearer(customer.token));
      expect(offers.body).toEqual([]);
    });
  });

  describe('account overview', () => {
    it('counts spend over countable orders only and lists what needs doing', async () => {
      const admin = await account(UserRole.ADMIN);
      const customer = await account();
      const { product } = await catalogue(admin, '100000.00', 20);
      const shipping = {
        recipientName: 'Nguyen Van A',
        phone: '0901234567',
        addressLine: '12 Nguyen Hue',
        city: 'Ho Chi Minh',
      };
      const place = async () => {
        await addToCart(customer, product.id, 1);
        const order = await api()
          .post('/api/orders/checkout')
          .set(bearer(customer.token))
          .send(shipping);
        expect(order.status).toBe(201);
        return order.body;
      };

      const completed = await place();
      for (const status of ['PAID', 'SHIPPED', 'COMPLETED'])
        await api()
          .patch(`/api/orders/${completed.id}/status`)
          .set(bearer(admin.token))
          .send({ status });

      const cancelled = await place();
      await api()
        .patch(`/api/orders/${cancelled.id}/cancel`)
        .set(bearer(customer.token))
        .send({});

      // A third order left PENDING.
      await place();

      const overview = await api()
        .get('/api/me/overview')
        .set(bearer(customer.token));
      expect(overview.status).toBe(200);
      expect(overview.body.orders.total).toBe(3);
      expect(overview.body.orders.countable).toBe(1);
      // Cancelled and pending money is not spend — the same rule the admin
      // revenue report uses.
      expect(overview.body.spend.lifetime).toBe('100000.00');
      expect(overview.body.spend.average).toBe('100000.00');
      // Completed and unreviewed, so the customer is invited to review it.
      expect(overview.body.reviews.invited).toBe(1);
      expect(overview.body.reviews.written).toBe(0);
      expect(overview.body.actions).toContain('pending-payment');
      expect(overview.body.actions).toContain('review-invited');
    });

    it('is all zeroes for a brand-new account and needs a token', async () => {
      const customer = await account();
      const overview = await api()
        .get('/api/me/overview')
        .set(bearer(customer.token));
      expect(overview.body.orders.total).toBe(0);
      expect(overview.body.spend.lifetime).toBe('0.00');
      expect(overview.body.spend.average).toBe('0.00');
      // A freshly registered account is unverified — only accounts that
      // predated the verification column were backfilled as verified — so the
      // one action offered is the nudge to verify.
      expect(overview.body.actions).toEqual(['verify-email']);
      expect((await api().get('/api/me/overview')).status).toBe(401);
    });
  });
});
