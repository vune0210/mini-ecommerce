import { StockMovementReason } from '../inventory/entities/stock-movement.entity';
import { OrderStatus } from '../orders/entities/order.entity';
import { ReturnStatus } from './entities/return-request.entity';
import {
  buildReturnNumber,
  CLAIMING_RETURN_STATUSES,
  claimsReturnedQuantity,
  isTerminalReturnStatus,
  mergeReturnLines,
  refundTotal,
  remainingReturnable,
  RETURN_STOCK_MOVEMENT_REASON,
  RETURN_WINDOW_DAYS,
  returnEligibility,
  returnLineFailures,
  returnLineSubtotal,
  returnMovementNote,
  returnWindowEndsAt,
  validReturnTransition,
  visibleReturnStatusEvent,
  withinReturnWindow,
} from './return-rules';

const DAY_MS = 24 * 60 * 60 * 1000;
const completedAt = new Date('2026-06-01T09:00:00.000Z');

describe('return rules', () => {
  describe('return window', () => {
    it('defaults to 30 days after completion', () => {
      expect(RETURN_WINDOW_DAYS).toBe(30);
      expect(returnWindowEndsAt(completedAt).toISOString()).toBe(
        '2026-07-01T09:00:00.000Z',
      );
    });

    it('keeps a constant length regardless of month or DST', () => {
      // Added in milliseconds, not by bumping the calendar: a February return
      // must not be shorter than a March one, and a clock change must not eat
      // an hour of somebody's deadline.
      const february = new Date('2026-02-10T00:00:00.000Z');
      const march = new Date('2026-03-25T00:00:00.000Z');
      expect(returnWindowEndsAt(february).getTime() - february.getTime()).toBe(
        30 * DAY_MS,
      );
      expect(returnWindowEndsAt(march).getTime() - march.getTime()).toBe(
        30 * DAY_MS,
      );
    });

    it('includes the final instant and excludes the one after it', () => {
      const deadline = returnWindowEndsAt(completedAt);
      expect(withinReturnWindow(completedAt, deadline)).toBe(true);
      expect(
        withinReturnWindow(completedAt, new Date(deadline.getTime() + 1)),
      ).toBe(false);
      expect(
        withinReturnWindow(completedAt, new Date(deadline.getTime() - 1)),
      ).toBe(true);
    });

    it('is open the moment the order completes', () => {
      expect(withinReturnWindow(completedAt, completedAt)).toBe(true);
    });

    it('honours a custom window length', () => {
      const sevenDaysOn = new Date(completedAt.getTime() + 7 * DAY_MS);
      expect(withinReturnWindow(completedAt, sevenDaysOn, 7)).toBe(true);
      expect(
        withinReturnWindow(completedAt, new Date(sevenDaysOn.getTime() + 1), 7),
      ).toBe(false);
      // A zero-day window closes immediately but still admits the instant
      // itself, so it cannot reject a request submitted at completion time.
      expect(withinReturnWindow(completedAt, completedAt, 0)).toBe(true);
    });
  });

  describe('returnEligibility', () => {
    const inWindow = new Date(completedAt.getTime() + DAY_MS);

    it('accepts a completed order inside the window', () => {
      expect(
        returnEligibility(OrderStatus.COMPLETED, completedAt, inWindow),
      ).toEqual({ eligible: true });
    });

    it('refuses every status but COMPLETED', () => {
      for (const status of [
        OrderStatus.PENDING,
        OrderStatus.PAID,
        OrderStatus.SHIPPED,
        OrderStatus.CANCELLED,
      ]) {
        const verdict = returnEligibility(status, completedAt, inWindow);
        expect(verdict.eligible).toBe(false);
        expect(verdict).toMatchObject({
          reason: 'Only completed orders can be returned',
        });
      }
    });

    it('names the deadline when the window has closed', () => {
      const verdict = returnEligibility(
        OrderStatus.COMPLETED,
        completedAt,
        new Date('2026-08-01T00:00:00.000Z'),
      );
      expect(verdict.eligible).toBe(false);
      // The customer is told when it closed, not just that it did.
      expect(verdict).toMatchObject({
        reason: expect.stringContaining('2026-07-01T09:00:00.000Z') as string,
      });
    });

    it('checks the status before the window', () => {
      // A cancelled order long past the window must not be reported as "too
      // late" — it was never returnable in the first place.
      expect(
        returnEligibility(
          OrderStatus.CANCELLED,
          completedAt,
          new Date('2027-01-01T00:00:00.000Z'),
        ),
      ).toEqual({
        eligible: false,
        reason: 'Only completed orders can be returned',
      });
    });
  });

  describe('remaining returnable quantity', () => {
    it('is what was bought minus what is already claimed', () => {
      expect(
        remainingReturnable({ orderItemId: 'a', purchased: 5, claimed: 2 }),
      ).toBe(3);
      expect(
        remainingReturnable({ orderItemId: 'a', purchased: 5, claimed: 5 }),
      ).toBe(0);
    });

    it('never goes negative', () => {
      // Data written before this rule existed, or a hand-edited row, must not
      // turn into a negative allowance that then reads as "returnable".
      expect(
        remainingReturnable({ orderItemId: 'a', purchased: 2, claimed: 7 }),
      ).toBe(0);
    });
  });

  describe('mergeReturnLines', () => {
    it('sums repeated references to the same order line', () => {
      // Two halves must be judged as one total, or each passes the remaining
      // check on its own and the customer returns more than they bought.
      expect(
        mergeReturnLines([
          { orderItemId: 'a', quantity: 1 },
          { orderItemId: 'b', quantity: 2 },
          { orderItemId: 'a', quantity: 3 },
        ]),
      ).toEqual([
        { orderItemId: 'a', quantity: 4 },
        { orderItemId: 'b', quantity: 2 },
      ]);
    });

    it('keeps first-appearance order and leaves the input alone', () => {
      const lines = [
        { orderItemId: 'z', quantity: 1 },
        { orderItemId: 'a', quantity: 1 },
      ];
      expect(mergeReturnLines(lines).map((line) => line.orderItemId)).toEqual([
        'z',
        'a',
      ]);
      expect(lines).toHaveLength(2);
      expect(lines[0].quantity).toBe(1);
    });

    it('passes single lines through untouched', () => {
      expect(mergeReturnLines([{ orderItemId: 'a', quantity: 2 }])).toEqual([
        { orderItemId: 'a', quantity: 2 },
      ]);
      expect(mergeReturnLines([])).toEqual([]);
    });
  });

  describe('returnLineFailures', () => {
    const returnable = [
      { orderItemId: 'a', purchased: 3, claimed: 1 },
      { orderItemId: 'b', purchased: 2, claimed: 2 },
    ];

    it('accepts a request for exactly what is left', () => {
      expect(
        returnLineFailures([{ orderItemId: 'a', quantity: 2 }], returnable),
      ).toEqual([]);
    });

    it('rejects one unit more than is left', () => {
      expect(
        returnLineFailures([{ orderItemId: 'a', quantity: 3 }], returnable),
      ).toEqual([
        {
          orderItemId: 'a',
          requested: 3,
          remaining: 2,
          reason: 'exceeds-remaining',
        },
      ]);
    });

    it('rejects a line that is fully claimed already', () => {
      expect(
        returnLineFailures([{ orderItemId: 'b', quantity: 1 }], returnable),
      ).toEqual([
        {
          orderItemId: 'b',
          requested: 1,
          remaining: 0,
          reason: 'exceeds-remaining',
        },
      ]);
    });

    it('separates a line that is not on the order from an over-claim', () => {
      // The two lead somewhere completely different: a wrong id is a client
      // bug, an over-claim is a race with an earlier request.
      expect(
        returnLineFailures(
          [
            { orderItemId: 'ghost', quantity: 1 },
            { orderItemId: 'a', quantity: 9 },
          ],
          returnable,
        ),
      ).toEqual([
        {
          orderItemId: 'ghost',
          requested: 1,
          remaining: 0,
          reason: 'not-in-order',
        },
        {
          orderItemId: 'a',
          requested: 9,
          remaining: 2,
          reason: 'exceeds-remaining',
        },
      ]);
    });

    it('catches a split request once the duplicates are merged', () => {
      const split = [
        { orderItemId: 'a', quantity: 1 },
        { orderItemId: 'a', quantity: 2 },
      ];
      // Judged line by line, both halves fit inside the 2 remaining.
      expect(returnLineFailures(split, returnable)).toEqual([]);
      expect(returnLineFailures(mergeReturnLines(split), returnable)).toEqual([
        {
          orderItemId: 'a',
          requested: 3,
          remaining: 2,
          reason: 'exceeds-remaining',
        },
      ]);
    });

    it('reports nothing for an empty request', () => {
      expect(returnLineFailures([], returnable)).toEqual([]);
    });
  });

  describe('refund arithmetic', () => {
    it('multiplies the snapshotted unit price by the quantity', () => {
      expect(returnLineSubtotal('12.50', 2)).toBe('25.00');
      expect(returnLineSubtotal('0.1', 3)).toBe('0.30');
    });

    it('sums the lines to two decimals', () => {
      expect(
        refundTotal([
          { unitPrice: '12.50', quantity: 2 },
          { unitPrice: '3.25', quantity: 3 },
        ]),
      ).toBe('34.75');
    });

    it('rounds cents rather than trailing float error', () => {
      // 0.1 + 0.2 arithmetic must not surface as 30000.000000000004 on an
      // invoice.
      expect(
        refundTotal([
          { unitPrice: '0.1', quantity: 1 },
          { unitPrice: '0.2', quantity: 1 },
        ]),
      ).toBe('0.30');
      expect(refundTotal([{ unitPrice: 19.99, quantity: 3 }])).toBe('59.97');
    });

    it('is 0.00 for an empty return', () => {
      expect(refundTotal([])).toBe('0.00');
    });

    it('never returns a negative refund', () => {
      // A negative price would mean the return bills the customer; clamp it.
      expect(refundTotal([{ unitPrice: '-5.00', quantity: 1 }])).toBe('0.00');
    });
  });

  describe('buildReturnNumber', () => {
    const date = new Date('2026-07-26T10:00:00.000Z');

    it('stamps the UTC date and stays inside the alphabet', () => {
      expect(buildReturnNumber(date, () => 0)).toBe('RET-260726-00000');
      expect(buildReturnNumber(date, () => 0.999999)).toBe('RET-260726-ZZZZZ');
      // A random() of exactly 1 must not fall off the end of the alphabet.
      expect(buildReturnNumber(date, () => 1)).toBe('RET-260726-ZZZZZ');
    });

    it('pads single-digit months and days', () => {
      expect(
        buildReturnNumber(new Date('2026-01-05T00:00:00.000Z'), () => 0),
      ).toBe('RET-260105-00000');
    });

    it('takes the UTC day, not the local one', () => {
      // 23:30 UTC is already tomorrow east of Greenwich; the number must not
      // depend on where the server happens to run.
      expect(
        buildReturnNumber(new Date('2026-12-31T23:30:00.000Z'), () => 0),
      ).toBe('RET-261231-00000');
    });

    it('fits the request_number column and is distinct from an order number', () => {
      const number = buildReturnNumber(date);
      expect(number.length).toBeLessThanOrEqual(24);
      expect(number).toMatch(/^RET-\d{6}-[0-9A-HJ-NP-Z]{5}$/);
    });
  });

  describe('lifecycle', () => {
    it('walks REQUESTED -> APPROVED -> RECEIVED -> REFUNDED', () => {
      expect(
        validReturnTransition(ReturnStatus.REQUESTED, ReturnStatus.APPROVED),
      ).toBe(true);
      expect(
        validReturnTransition(ReturnStatus.APPROVED, ReturnStatus.RECEIVED),
      ).toBe(true);
      expect(
        validReturnTransition(ReturnStatus.RECEIVED, ReturnStatus.REFUNDED),
      ).toBe(true);
    });

    it('allows rejection while requested or approved, and nowhere later', () => {
      expect(
        validReturnTransition(ReturnStatus.REQUESTED, ReturnStatus.REJECTED),
      ).toBe(true);
      expect(
        validReturnTransition(ReturnStatus.APPROVED, ReturnStatus.REJECTED),
      ).toBe(true);
      // The goods are already back on the shelf; rejecting now would leave the
      // stock credited and the customer with nothing.
      expect(
        validReturnTransition(ReturnStatus.RECEIVED, ReturnStatus.REJECTED),
      ).toBe(false);
    });

    it('allows withdrawal only before anyone has acted', () => {
      expect(
        validReturnTransition(ReturnStatus.REQUESTED, ReturnStatus.CANCELLED),
      ).toBe(true);
      expect(
        validReturnTransition(ReturnStatus.APPROVED, ReturnStatus.CANCELLED),
      ).toBe(false);
    });

    it('refuses to skip the goods coming back', () => {
      expect(
        validReturnTransition(ReturnStatus.REQUESTED, ReturnStatus.RECEIVED),
      ).toBe(false);
      expect(
        validReturnTransition(ReturnStatus.APPROVED, ReturnStatus.REFUNDED),
      ).toBe(false);
    });

    it('refuses to move backwards or stand still', () => {
      expect(
        validReturnTransition(ReturnStatus.APPROVED, ReturnStatus.REQUESTED),
      ).toBe(false);
      expect(
        validReturnTransition(ReturnStatus.RECEIVED, ReturnStatus.APPROVED),
      ).toBe(false);
      for (const status of Object.values(ReturnStatus))
        expect(validReturnTransition(status, status)).toBe(false);
    });

    it('lets nothing out of a terminal status', () => {
      for (const terminal of [
        ReturnStatus.REFUNDED,
        ReturnStatus.REJECTED,
        ReturnStatus.CANCELLED,
      ]) {
        expect(isTerminalReturnStatus(terminal)).toBe(true);
        for (const next of Object.values(ReturnStatus))
          expect(validReturnTransition(terminal, next)).toBe(false);
      }
    });

    it('treats every in-flight status as non-terminal', () => {
      for (const open of [
        ReturnStatus.REQUESTED,
        ReturnStatus.APPROVED,
        ReturnStatus.RECEIVED,
      ])
        expect(isTerminalReturnStatus(open)).toBe(false);
    });
  });

  describe('quantity claims', () => {
    it('holds the units until the request is rejected or withdrawn', () => {
      // REFUNDED still counts: those units are spent for good, so the same
      // line cannot be returned a second time.
      expect(claimsReturnedQuantity(ReturnStatus.REQUESTED)).toBe(true);
      expect(claimsReturnedQuantity(ReturnStatus.APPROVED)).toBe(true);
      expect(claimsReturnedQuantity(ReturnStatus.RECEIVED)).toBe(true);
      expect(claimsReturnedQuantity(ReturnStatus.REFUNDED)).toBe(true);
      expect(claimsReturnedQuantity(ReturnStatus.REJECTED)).toBe(false);
      expect(claimsReturnedQuantity(ReturnStatus.CANCELLED)).toBe(false);
    });

    it('exposes exactly those statuses for the SQL filter', () => {
      expect([...CLAIMING_RETURN_STATUSES].sort()).toEqual(
        [
          ReturnStatus.APPROVED,
          ReturnStatus.RECEIVED,
          ReturnStatus.REFUNDED,
          ReturnStatus.REQUESTED,
        ].sort(),
      );
    });
  });

  describe('stock ledger labelling', () => {
    it('does not claim a return was a cancellation', () => {
      // CANCELLATION would assert in the audit trail that a delivered,
      // completed order was cancelled — a claim the ledger would then defend.
      // ADJUSTMENT would flatten it into "someone corrected the count".
      expect(RETURN_STOCK_MOVEMENT_REASON).not.toBe(
        StockMovementReason.CANCELLATION,
      );
      expect(RETURN_STOCK_MOVEMENT_REASON).not.toBe(
        StockMovementReason.ADJUSTMENT,
      );
      expect(RETURN_STOCK_MOVEMENT_REASON).toBe(StockMovementReason.RETURN);
    });

    it('names the request in the note so the row stays traceable', () => {
      expect(returnMovementNote('RET-260726-AB12X')).toContain(
        'RET-260726-AB12X',
      );
    });
  });

  describe('visibleReturnStatusEvent', () => {
    it('redacts the actor id from owner-facing events', () => {
      const event = {
        fromStatus: ReturnStatus.REQUESTED,
        toStatus: ReturnStatus.APPROVED,
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
        note: 'Photos check out',
        createdAt: new Date('2026-07-26T10:00:00.000Z'),
        actorUser: { name: 'Ops Admin' },
      };
      // Owners still learn who acted (role + display name) — just never the id.
      expect(visibleReturnStatusEvent(event, false)).toEqual({
        fromStatus: ReturnStatus.REQUESTED,
        toStatus: ReturnStatus.APPROVED,
        actorRole: 'ADMIN',
        actorId: null,
        actorName: 'Ops Admin',
        note: 'Photos check out',
        createdAt: new Date('2026-07-26T10:00:00.000Z'),
      });
      expect(visibleReturnStatusEvent(event, true).actorId).toBe('admin-1');
    });

    it('keeps the role snapshot when the actor account was deleted', () => {
      // actor_user_id is ON DELETE SET NULL; the varchar role snapshot survives.
      expect(
        visibleReturnStatusEvent(
          {
            fromStatus: null,
            toStatus: ReturnStatus.REQUESTED,
            actorUserId: null,
            actorRole: 'CUSTOMER',
            note: null,
            createdAt: new Date('2026-07-01T00:00:00.000Z'),
            actorUser: null,
          },
          true,
        ),
      ).toEqual({
        fromStatus: null,
        toStatus: ReturnStatus.REQUESTED,
        actorRole: 'CUSTOMER',
        actorId: null,
        actorName: null,
        note: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
      });
    });
  });
});
