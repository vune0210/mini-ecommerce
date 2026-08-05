import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationType } from './entities/notification.entity';
import {
  BODY_MAX_LENGTH,
  buildNotificationRow,
  categoryOf,
  defaultPreferences,
  isMuted,
  notificationLink,
  serializeNotification,
  serializePreferences,
  shouldRethrowEmitFailure,
  TITLE_MAX_LENGTH,
} from './notification-rules';

/** A saved row with every switch on, then whatever the test mutes. */
function preferenceRow(
  overrides: Partial<NotificationPreference> = {},
): NotificationPreference {
  const row = new NotificationPreference();
  row.id = 'pref-1';
  row.userId = 'user-1';
  row.orderUpdates = true;
  row.reviewUpdates = true;
  row.promotions = true;
  row.stockAlerts = true;
  row.productAnswers = true;
  row.createdAt = new Date('2026-07-01T00:00:00.000Z');
  row.updatedAt = new Date('2026-07-01T00:00:00.000Z');
  return Object.assign(row, overrides);
}

/** Shaped like a driver error: TypeORM copies `code` onto the wrapper it throws. */
function dbError(code: string): Error {
  return Object.assign(new Error(`mysql said ${code}`), { code });
}

describe('notification rules', () => {
  describe('categories and muting', () => {
    it('groups the order types under one switch', () => {
      expect(categoryOf(NotificationType.ORDER_PLACED)).toBe('orderUpdates');
      expect(categoryOf(NotificationType.ORDER_STATUS_CHANGED)).toBe(
        'orderUpdates',
      );
    });

    it('gives ACCOUNT_SECURITY no category, so it can never be muted', () => {
      expect(categoryOf(NotificationType.ACCOUNT_SECURITY)).toBeNull();
      expect(
        isMuted(NotificationType.ACCOUNT_SECURITY, {
          ...defaultPreferences(),
          orderUpdates: false,
          promotions: false,
        }),
      ).toBe(false);
    });

    it('treats a customer with no saved preferences as opted in', () => {
      expect(isMuted(NotificationType.COUPON_EXPIRING, null)).toBe(false);
      expect(defaultPreferences()).toEqual({
        orderUpdates: true,
        reviewUpdates: true,
        promotions: true,
        stockAlerts: true,
        productAnswers: true,
      });
    });

    it('mutes only the category that was switched off', () => {
      const preferences = serializePreferences(
        preferenceRow({ promotions: false }),
      );
      expect(isMuted(NotificationType.COUPON_EXPIRING, preferences)).toBe(true);
      expect(isMuted(NotificationType.ORDER_PLACED, preferences)).toBe(false);
      expect(isMuted(NotificationType.STOCK_BACK, preferences)).toBe(false);
    });

    it('projects a row to switches only, leaking no ids or timestamps', () => {
      expect(
        serializePreferences(preferenceRow({ stockAlerts: false })),
      ).toEqual({ ...defaultPreferences(), stockAlerts: false });
      expect(serializePreferences(null)).toEqual(defaultPreferences());
    });
  });

  describe('SPA links', () => {
    it('points order notifications at the order', () => {
      expect(
        notificationLink(NotificationType.ORDER_STATUS_CHANGED, {
          orderId: 'ord-7',
        }),
      ).toBe('/orders/ord-7');
    });

    it('falls back to a list page when the id is missing', () => {
      expect(notificationLink(NotificationType.ORDER_PLACED, null)).toBe(
        '/orders',
      );
      expect(notificationLink(NotificationType.STOCK_BACK, {})).toBe(
        '/products',
      );
    });

    it('refuses an id that would steer the path somewhere else', () => {
      expect(
        notificationLink(NotificationType.ANSWER_POSTED, {
          productId: '../../admin/users',
        }),
      ).toBe('/products');
      expect(
        notificationLink(NotificationType.ORDER_PLACED, { orderId: 42 }),
      ).toBe('/orders');
    });

    it('sends the mutable non-entity types somewhere useful', () => {
      expect(notificationLink(NotificationType.COUPON_EXPIRING, null)).toBe(
        '/cart',
      );
      expect(notificationLink(NotificationType.ACCOUNT_SECURITY, null)).toBe(
        '/dashboard',
      );
    });
  });

  describe('building a row from a draft', () => {
    it('derives the link from the type when the caller supplies none', () => {
      expect(
        buildNotificationRow({
          userId: 'user-1',
          type: NotificationType.ORDER_STATUS_CHANGED,
          title: '  Order shipped  ',
          body: '   ',
          metadata: { orderId: 'ord-7', status: 'SHIPPED' },
        }),
      ).toEqual({
        userId: 'user-1',
        type: NotificationType.ORDER_STATUS_CHANGED,
        title: 'Order shipped',
        body: null,
        link: '/orders/ord-7',
        metadata: { orderId: 'ord-7', status: 'SHIPPED' },
      });
    });

    it('keeps an explicit relative link but drops an absolute one', () => {
      expect(
        buildNotificationRow({
          userId: 'user-1',
          type: NotificationType.ORDER_PLACED,
          title: 'Thanks',
          link: '/orders/ord-9?tab=items',
          metadata: { orderId: 'ord-7' },
        }).link,
      ).toBe('/orders/ord-9?tab=items');
      expect(
        buildNotificationRow({
          userId: 'user-1',
          type: NotificationType.ORDER_PLACED,
          title: 'Thanks',
          link: 'https://evil.example/steal',
          metadata: { orderId: 'ord-7' },
        }).link,
      ).toBe('/orders/ord-7');
      expect(
        buildNotificationRow({
          userId: 'user-1',
          type: NotificationType.ORDER_PLACED,
          title: 'Thanks',
          link: '//evil.example/steal',
        }).link,
      ).toBe('/orders');
    });

    it('truncates over-long text instead of losing the notification', () => {
      const row = buildNotificationRow({
        userId: 'user-1',
        type: NotificationType.STOCK_BACK,
        title: 'x'.repeat(TITLE_MAX_LENGTH + 50),
        body: 'y'.repeat(BODY_MAX_LENGTH + 50),
      });
      expect(row.title).toHaveLength(TITLE_MAX_LENGTH);
      expect(row.body).toHaveLength(BODY_MAX_LENGTH);
    });

    it('falls back to the type when a caller passes a blank title', () => {
      expect(
        buildNotificationRow({
          userId: 'user-1',
          type: NotificationType.REVIEW_MODERATED,
          title: '   ',
        }).title,
      ).toBe(NotificationType.REVIEW_MODERATED);
    });
  });

  describe('the public projection', () => {
    it('derives `read` and publishes nothing the row does not need to expose', () => {
      const createdAt = new Date('2026-07-20T10:00:00.000Z');
      const readAt = new Date('2026-07-21T08:00:00.000Z');
      const projection = serializeNotification({
        id: 'n-1',
        type: NotificationType.ORDER_PLACED,
        title: 'Order placed',
        body: null,
        link: '/orders/ord-7',
        metadata: { orderId: 'ord-7' },
        readAt,
        createdAt,
      });
      expect(projection).toEqual({
        id: 'n-1',
        type: NotificationType.ORDER_PLACED,
        title: 'Order placed',
        body: null,
        link: '/orders/ord-7',
        metadata: { orderId: 'ord-7' },
        read: true,
        readAt,
        createdAt,
      });
      expect(Object.keys(projection)).not.toContain('userId');
    });

    it('reports an unread row as unread', () => {
      expect(
        serializeNotification({
          id: 'n-2',
          type: NotificationType.COUPON_EXPIRING,
          title: 'Coupon expiring',
          body: 'SALE10 ends tomorrow',
          link: '/cart',
          metadata: null,
          readAt: null,
          createdAt: new Date('2026-07-20T10:00:00.000Z'),
        }).read,
      ).toBe(false);
    });
  });

  describe('when an emit fails', () => {
    it('swallows infrastructure trouble so the business operation survives', () => {
      expect(shouldRethrowEmitFailure(dbError('ER_NO_SUCH_TABLE'), true)).toBe(
        false,
      );
      expect(shouldRethrowEmitFailure(dbError('ECONNREFUSED'), false)).toBe(
        false,
      );
      expect(shouldRethrowEmitFailure(new Error('boom'), true)).toBe(false);
      expect(shouldRethrowEmitFailure('not even an error', true)).toBe(false);
    });

    it('rethrows programming errors, which are bugs and must be loud', () => {
      expect(
        shouldRethrowEmitFailure(new TypeError('undefined is not a fn'), false),
      ).toBe(true);
      expect(shouldRethrowEmitFailure(new RangeError('nope'), false)).toBe(
        true,
      );
      expect(shouldRethrowEmitFailure(new ReferenceError('nope'), true)).toBe(
        true,
      );
    });

    it('rethrows a deadlock only inside the caller transaction it already killed', () => {
      expect(shouldRethrowEmitFailure(dbError('ER_LOCK_DEADLOCK'), true)).toBe(
        true,
      );
      expect(
        shouldRethrowEmitFailure(dbError('ER_LOCK_WAIT_TIMEOUT'), true),
      ).toBe(true);
      expect(shouldRethrowEmitFailure(dbError('ER_LOCK_DEADLOCK'), false)).toBe(
        false,
      );
    });

    it('reads the code off a wrapped driver error too', () => {
      const wrapped = Object.assign(new Error('query failed'), {
        driverError: { code: 'ER_LOCK_DEADLOCK' },
      });
      expect(shouldRethrowEmitFailure(wrapped, true)).toBe(true);
      expect(shouldRethrowEmitFailure(wrapped, false)).toBe(false);
    });
  });
});
