import { StockMovementReason } from '../inventory/entities/stock-movement.entity';
import { OrderStatus } from '../orders/entities/order.entity';
import { ReturnStatus } from './entities/return-request.entity';

/**
 * How long after delivery a customer may still open a return. A named constant
 * rather than a literal in the service because it is the one number support
 * staff and the storefront copy both have to quote, and it changes as a
 * business decision.
 */
export const RETURN_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Added in milliseconds rather than by bumping the calendar month, so the
 * window keeps a constant length across DST shifts and month boundaries — a
 * February return must not be shorter than a March one.
 */
export function returnWindowEndsAt(
  completedAt: Date,
  windowDays: number = RETURN_WINDOW_DAYS,
): Date {
  return new Date(completedAt.getTime() + windowDays * DAY_MS);
}

/** Inclusive of the final instant: a deadline should not expire mid-request. */
export function withinReturnWindow(
  completedAt: Date,
  now: Date,
  windowDays: number = RETURN_WINDOW_DAYS,
): boolean {
  return now.getTime() <= returnWindowEndsAt(completedAt, windowDays).getTime();
}

export type ReturnEligibility =
  { eligible: true } | { eligible: false; reason: string };

/**
 * The whole "may this order be returned at all" decision, message included, so
 * the API answer cannot drift from the rule that produced it.
 *
 * Only COMPLETED orders qualify: anything earlier is still cancellable, and
 * cancelling releases the coupon and restocks, which a return deliberately
 * does not do the same way.
 */
export function returnEligibility(
  orderStatus: OrderStatus,
  completedAt: Date,
  now: Date,
  windowDays: number = RETURN_WINDOW_DAYS,
): ReturnEligibility {
  if (orderStatus !== OrderStatus.COMPLETED)
    return {
      eligible: false,
      reason: 'Only completed orders can be returned',
    };
  if (!withinReturnWindow(completedAt, now, windowDays))
    return {
      eligible: false,
      reason: `The ${windowDays}-day return window for this order closed on ${returnWindowEndsAt(
        completedAt,
        windowDays,
      ).toISOString()}`,
    };
  return { eligible: true };
}

export type RequestedReturnLine = { orderItemId: string; quantity: number };

/**
 * What one order line still owes the customer: bought minus everything already
 * claimed by requests that have not been rejected or withdrawn.
 */
export type ReturnableLine = {
  orderItemId: string;
  purchased: number;
  claimed: number;
};

export function remainingReturnable(line: ReturnableLine): number {
  return Math.max(0, line.purchased - line.claimed);
}

/**
 * Collapses repeated references to the same order line into one, summing the
 * quantities. A payload listing the same line twice must be judged on its
 * total, or two halves each pass the remaining-quantity check and the customer
 * returns more than they bought. Order of first appearance is kept so the
 * error the caller gets back lists lines the way they sent them.
 */
export function mergeReturnLines(
  lines: readonly RequestedReturnLine[],
): RequestedReturnLine[] {
  const merged = new Map<string, number>();
  for (const line of lines)
    merged.set(
      line.orderItemId,
      (merged.get(line.orderItemId) ?? 0) + line.quantity,
    );
  return [...merged].map(([orderItemId, quantity]) => ({
    orderItemId,
    quantity,
  }));
}

export type ReturnLineFailure = {
  orderItemId: string;
  requested: number;
  remaining: number;
  /** `not-in-order` is a malformed request; `exceeds-remaining` is a conflict. */
  reason: 'not-in-order' | 'exceeds-remaining';
};

/**
 * The lines a return must refuse, with the reason attached. The two reasons
 * lead somewhere completely different — a line that is not on the order means
 * the client sent the wrong id, while an over-claim means someone else (or an
 * earlier request) already spoke for those units — so they are never collapsed
 * into one "invalid items" message.
 *
 * Expects lines already merged by `mergeReturnLines`.
 */
export function returnLineFailures(
  requested: readonly RequestedReturnLine[],
  returnable: readonly ReturnableLine[],
): ReturnLineFailure[] {
  const byId = new Map(returnable.map((line) => [line.orderItemId, line]));
  const failures: ReturnLineFailure[] = [];
  for (const line of requested) {
    const match = byId.get(line.orderItemId);
    if (!match) {
      failures.push({
        orderItemId: line.orderItemId,
        requested: line.quantity,
        remaining: 0,
        reason: 'not-in-order',
      });
      continue;
    }
    const remaining = remainingReturnable(match);
    if (line.quantity > remaining)
      failures.push({
        orderItemId: line.orderItemId,
        requested: line.quantity,
        remaining,
        reason: 'exceeds-remaining',
      });
  }
  return failures;
}

function roundCurrency(value: number): string {
  return Math.max(0, Math.round((value + Number.EPSILON) * 100) / 100).toFixed(
    2,
  );
}

/** Snapshot arithmetic: `unitPrice` is what was paid, not what it costs today. */
export function returnLineSubtotal(
  unitPrice: string | number,
  quantity: number,
): string {
  return roundCurrency(Number(unitPrice) * quantity);
}

/**
 * The single definition of what a return is worth. Summed from the line
 * snapshots so the figure an admin approves is the figure the customer was
 * quoted, whatever the catalogue has done since.
 */
export function refundTotal(
  lines: readonly { unitPrice: string | number; quantity: number }[],
): string {
  return roundCurrency(
    lines.reduce(
      (total, line) => total + Number(line.unitPrice) * line.quantity,
      0,
    ),
  );
}

// Same alphabet as the order number: digits plus uppercase letters without I
// and O, which are the two characters a human reads back wrong over the phone.
// Duplicated rather than imported because the orders module keeps it private,
// and this file must not reach into another module's internals.
const RETURN_NUMBER_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const RETURN_NUMBER_SUFFIX_LENGTH = 5;

/**
 * `RET-YYMMDD-XXXXX`, mirroring `buildOrderNumber`. UTC-stamped so two servers
 * in different regions cannot mint the same-looking number for different days,
 * and the random suffix is injectable so tests are not at the mercy of
 * `Math.random`. Collisions are handled by retrying the insert, not by probing.
 */
export function buildReturnNumber(
  date: Date,
  random: () => number = Math.random,
): string {
  const stamp = [
    `${date.getUTCFullYear() % 100}`.padStart(2, '0'),
    `${date.getUTCMonth() + 1}`.padStart(2, '0'),
    `${date.getUTCDate()}`.padStart(2, '0'),
  ].join('');
  let suffix = '';
  for (let index = 0; index < RETURN_NUMBER_SUFFIX_LENGTH; index += 1) {
    const position = Math.min(
      Math.floor(random() * RETURN_NUMBER_ALPHABET.length),
      RETURN_NUMBER_ALPHABET.length - 1,
    );
    suffix += RETURN_NUMBER_ALPHABET.charAt(Math.max(position, 0));
  }
  return `RET-${stamp}-${suffix}`;
}

const transitions: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: [
    ReturnStatus.APPROVED,
    ReturnStatus.REJECTED,
    ReturnStatus.CANCELLED,
  ],
  APPROVED: [ReturnStatus.RECEIVED, ReturnStatus.REJECTED],
  RECEIVED: [ReturnStatus.REFUNDED],
  REFUNDED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function validReturnTransition(
  current: ReturnStatus,
  next: ReturnStatus,
): boolean {
  return transitions[current].includes(next);
}

/**
 * Derived from the transition map rather than listed separately: a status with
 * nowhere left to go *is* terminal, and two hand-maintained lists would
 * eventually disagree.
 */
export function isTerminalReturnStatus(status: ReturnStatus): boolean {
  return transitions[status].length === 0;
}

/**
 * Whether a request in this status still holds its units against the order.
 * REFUNDED counts: those units are spent for good. Only a rejection or a
 * withdrawal hands the quantity back, letting the customer file again.
 */
export function claimsReturnedQuantity(status: ReturnStatus): boolean {
  return status !== ReturnStatus.REJECTED && status !== ReturnStatus.CANCELLED;
}

/** The statuses whose lines are counted when checking what is still returnable. */
export const CLAIMING_RETURN_STATUSES: readonly ReturnStatus[] = Object.values(
  ReturnStatus,
).filter(claimsReturnedQuantity);

/**
 * The ledger reason a received return is written under.
 *
 * Its own member, not a reuse: CANCELLATION would assert in the audit trail
 * that orders were cancelled which were in fact delivered and completed, and
 * ADJUSTMENT would flatten a customer return into "someone corrected the
 * count". `returnMovementNote` still names the request so a single row is
 * traceable back to the RMA without a join.
 */
export const RETURN_STOCK_MOVEMENT_REASON: StockMovementReason =
  StockMovementReason.RETURN;

/** Carries the truth the reason enum cannot yet express. */
export function returnMovementNote(requestNumber: string): string {
  return `Customer return ${requestNumber} received`;
}

export type ReturnStatusEventSource = {
  fromStatus: ReturnStatus | null;
  toStatus: ReturnStatus;
  actorUserId: string | null;
  actorRole: string | null;
  note: string | null;
  createdAt: Date;
  actorUser?: { name: string } | null;
};

export type VisibleReturnStatusEvent = {
  fromStatus: ReturnStatus | null;
  toStatus: ReturnStatus;
  actorRole: string | null;
  actorId: string | null;
  actorName: string | null;
  note: string | null;
  createdAt: Date;
};

/**
 * Projects a history row into the API event shape, with exactly the redaction
 * `visibleStatusEvent` applies to orders: owners see the actor as role +
 * display name, the actor's user id is admin-only, a null fromStatus marks the
 * creation event, and a deleted actor leaves id/name null while the actorRole
 * snapshot survives. Restated here rather than shared because the orders
 * version is typed to OrderStatus.
 */
export function visibleReturnStatusEvent(
  event: ReturnStatusEventSource,
  viewerIsAdmin: boolean,
): VisibleReturnStatusEvent {
  return {
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    actorRole: event.actorRole,
    actorId: viewerIsAdmin ? event.actorUserId : null,
    actorName: event.actorUser?.name ?? null,
    note: event.note,
    createdAt: event.createdAt,
  };
}
