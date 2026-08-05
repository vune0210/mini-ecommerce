/**
 * True when a stock movement is the moment a product became buyable again.
 *
 * Derived from the movement rather than watched on the product row, because
 * every stock change in the system already funnels through one ledger write —
 * a sale, a cancellation, a received return, an admin correction. Anything that
 * polled `products.stock` instead would need its own definition of "changed"
 * and would drift from the ledger the first time a path was added.
 *
 * The condition is a crossing, not a level: `balanceAfter > 0` alone would fire
 * on every restock of an item that never ran out, and mailing "it's back!" to
 * people who were never told it was gone is how a useful alert becomes spam.
 */
export function crossedIntoStock(delta: number, balanceAfter: number): boolean {
  if (delta <= 0) return false;
  if (balanceAfter <= 0) return false;
  // The level before this movement. Zero or less means it was unbuyable.
  return balanceAfter - delta <= 0;
}
