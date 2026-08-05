import {
  adjustedPrice,
  MAX_PRICE,
  MIN_PRICE,
  normalizeSuggestQuery,
  PriceAdjustmentMode,
  uniqueIds,
} from './bulk-rules';

describe('adjustedPrice', () => {
  it('applies a percentage increase and decrease', () => {
    expect(adjustedPrice('100000.00', PriceAdjustmentMode.PERCENT, 10)).toEqual(
      {
        ok: true,
        price: '110000.00',
      },
    );
    expect(
      adjustedPrice('100000.00', PriceAdjustmentMode.PERCENT, -25),
    ).toEqual({ ok: true, price: '75000.00' });
  });

  it('applies a fixed amount in either direction', () => {
    expect(
      adjustedPrice('249000.00', PriceAdjustmentMode.AMOUNT, -49000),
    ).toEqual({ ok: true, price: '200000.00' });
    expect(
      adjustedPrice('249000.00', PriceAdjustmentMode.AMOUNT, 1000),
    ).toEqual({
      ok: true,
      price: '250000.00',
    });
  });

  it('overwrites outright in SET mode', () => {
    expect(adjustedPrice('999.00', PriceAdjustmentMode.SET, 12.5)).toEqual({
      ok: true,
      price: '12.50',
    });
  });

  /**
   * The whole reason this returns a reason rather than clamping: a "-99%" typo
   * across a catalogue would otherwise report complete success while flattening
   * every product to one cent.
   */
  it('refuses a result below the minimum instead of clamping', () => {
    expect(adjustedPrice('100.00', PriceAdjustmentMode.PERCENT, -100)).toEqual({
      ok: false,
      reason: 'below-minimum',
    });
    expect(adjustedPrice('100.00', PriceAdjustmentMode.AMOUNT, -100)).toEqual({
      ok: false,
      reason: 'below-minimum',
    });
  });

  it('accepts a result that lands exactly on the minimum', () => {
    expect(adjustedPrice('1.00', PriceAdjustmentMode.SET, MIN_PRICE)).toEqual({
      ok: true,
      price: '0.01',
    });
  });

  it('refuses a result the column cannot hold', () => {
    expect(
      adjustedPrice(String(MAX_PRICE), PriceAdjustmentMode.PERCENT, 1),
    ).toEqual({ ok: false, reason: 'above-maximum' });
  });

  it('reports an unparseable stored price rather than writing NaN', () => {
    expect(adjustedPrice('n/a', PriceAdjustmentMode.PERCENT, 10)).toEqual({
      ok: false,
      reason: 'invalid-price',
    });
  });

  it('always lands on exactly two decimals', () => {
    for (const value of [3, 7, 33, -17]) {
      const outcome = adjustedPrice(
        '1234.56',
        PriceAdjustmentMode.PERCENT,
        value,
      );
      expect(outcome.ok && outcome.price).toMatch(/^\d+\.\d{2}$/);
    }
  });
});

describe('uniqueIds', () => {
  it('drops repeats but keeps the caller order', () => {
    expect(uniqueIds(['c', 'a', 'c', 'b', 'a'])).toEqual(['c', 'a', 'b']);
  });

  /** A repeated id would compound a percentage change on that one product. */
  it('collapses a duplicated selection to one entry', () => {
    expect(uniqueIds(['x', 'x', 'x'])).toEqual(['x']);
  });
});

describe('normalizeSuggestQuery', () => {
  it('accepts a usable term', () => {
    expect(normalizeSuggestQuery('  tai nghe ')).toBe('tai nghe');
  });

  it('refuses anything too short to be worth a round trip', () => {
    expect(normalizeSuggestQuery('a')).toBeNull();
    expect(normalizeSuggestQuery('   ')).toBeNull();
    expect(normalizeSuggestQuery(undefined)).toBeNull();
    expect(normalizeSuggestQuery(42)).toBeNull();
  });

  /** A typed `%` means the character, not "match everything". */
  it('strips LIKE wildcards rather than escaping them', () => {
    expect(normalizeSuggestQuery('%%%%ao')).toBe('ao');
    expect(normalizeSuggestQuery('a_o')).toBe('ao');
    expect(normalizeSuggestQuery(String.raw`a\o`)).toBe('ao');
    // Stripping can leave it too short — which is still the right answer.
    expect(normalizeSuggestQuery('%_%')).toBeNull();
  });

  it('bounds the length so one query cannot carry a payload', () => {
    expect(normalizeSuggestQuery('x'.repeat(200))).toHaveLength(64);
  });
});
