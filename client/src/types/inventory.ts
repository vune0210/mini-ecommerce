/**
 * Mirrors `server/src/inventory/entities/stock-movement.entity.ts`. The ledger
 * is append-only: nothing here is ever edited, only read.
 */

/** SALE and CANCELLATION are written by orders; a human may only write the other two. */
export type StockMovementReason = 'SALE' | 'CANCELLATION' | 'ADJUSTMENT' | 'RESTOCK';

/** The subset `PATCH /api/products/:id/stock` accepts (server: ManualStockReason). */
export type ManualStockReason = 'ADJUSTMENT' | 'RESTOCK';

/** Joined from the users table; null for order-driven rows and deleted accounts. */
export type StockMovementActor = { id: string; name: string; email: string };

export type StockMovement = {
  id: string;
  /** Null once the product is deleted — `productName` is the surviving record. */
  productId: string | null;
  /** Snapshot taken when the row was written, so the ledger outlives the product. */
  productName: string;
  /** Signed: negative consumed stock, positive returned or added it. */
  delta: number;
  /** Stored, not derived — one row is readable without replaying the ledger. */
  balanceAfter: number;
  reason: StockMovementReason;
  orderId: string | null;
  actorUserId: string | null;
  actorUser: StockMovementActor | null;
  note: string | null;
  createdAt: string;
};

export type StockMovementListResponse = {
  items: StockMovement[];
  total: number;
  page: number;
  limit: number;
};

/** `from`/`to` are UTC calendar days (`2026-07-01`), matching the stats range. */
export type StockMovementQuery = {
  page: number;
  productId: string;
  reason: '' | StockMovementReason;
  from?: string;
  to?: string;
};

/**
 * `stock` is the level the product must END AT, not an amount to add. The API is
 * absolute on purpose: a retried request converges instead of counting twice.
 */
export type StockAdjustmentInput = {
  id: string;
  stock: number;
  reason: ManualStockReason;
  note?: string;
};
