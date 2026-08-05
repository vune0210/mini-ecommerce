export enum PriceAdjustmentMode {
  /** Move the price by a percentage of itself. Negative discounts. */
  PERCENT = 'PERCENT',
  /** Move the price by a fixed amount. Negative discounts. */
  AMOUNT = 'AMOUNT',
  /** Overwrite the price outright, ignoring what it was. */
  SET = 'SET',
}

/** Prices are decimal(10,2) and the column is not signed. */
export const MIN_PRICE = 0.01;
export const MAX_PRICE = 99_999_999.99;

export type PriceAdjustmentOutcome =
  { ok: true; price: string } | { ok: false; reason: string };

/**
 * Computes one product's new price under a bulk adjustment.
 *
 * Returns a reason instead of clamping when the result would leave the
 * representable range. Clamping silently is the dangerous option here: a
 * "-90%" typo applied across a catalogue would set hundreds of products to
 * 0.01 and report complete success, and nothing in the response would say
 * which ones had been flattened.
 */
export function adjustedPrice(
  currentPrice: string | number,
  mode: PriceAdjustmentMode,
  value: number,
): PriceAdjustmentOutcome {
  const current = Number(currentPrice);
  if (!Number.isFinite(current)) return { ok: false, reason: 'invalid-price' };

  const raw =
    mode === PriceAdjustmentMode.SET
      ? value
      : mode === PriceAdjustmentMode.PERCENT
        ? current * (1 + value / 100)
        : current + value;

  // Round to cents before the bounds check, so a result that only fails by a
  // rounding artefact is not rejected.
  const rounded = Math.round((raw + Number.EPSILON) * 100) / 100;
  if (rounded < MIN_PRICE) return { ok: false, reason: 'below-minimum' };
  if (rounded > MAX_PRICE) return { ok: false, reason: 'above-maximum' };
  return { ok: true, price: rounded.toFixed(2) };
}

/**
 * De-duplicates a bulk selection while preserving the caller's order, so the
 * per-item report reads back in the order they sent. A repeated id in a bulk
 * price change would otherwise compound the adjustment on that one product.
 */
export function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/** Shortest query worth a round trip; below this the result is the catalogue. */
export const MIN_SUGGEST_LENGTH = 2;

/**
 * Prepares a typeahead term, or returns null when it is not worth querying.
 *
 * `%` and `_` are stripped rather than escaped: they are LIKE wildcards, and a
 * customer typing `%` into a search box means the literal character, not "match
 * everything". Escaping would technically work, but stripping keeps the
 * parameter free of backslash conventions that differ between drivers.
 */
export function normalizeSuggestQuery(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/[%_\\]/g, '');
  return trimmed.length >= MIN_SUGGEST_LENGTH ? trimmed.slice(0, 64) : null;
}
