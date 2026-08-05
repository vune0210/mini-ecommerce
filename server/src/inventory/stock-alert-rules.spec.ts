import { crossedIntoStock } from './stock-alert-rules';

describe('crossedIntoStock', () => {
  it('fires when the level crosses zero upwards', () => {
    // Sold out at 0, a return of 2 puts it back on sale.
    expect(crossedIntoStock(2, 2)).toBe(true);
    expect(crossedIntoStock(10, 10)).toBe(true);
  });

  /** Restocking something that never ran out is not news to anybody. */
  it('stays silent when the product was already buyable', () => {
    expect(crossedIntoStock(5, 12)).toBe(false);
    expect(crossedIntoStock(1, 2)).toBe(false);
  });

  it('stays silent on a sale', () => {
    expect(crossedIntoStock(-3, 7)).toBe(false);
    expect(crossedIntoStock(-3, 0)).toBe(false);
  });

  it('stays silent when the correction leaves it still unbuyable', () => {
    // An admin correcting a negative count up to zero has not restocked it.
    expect(crossedIntoStock(3, 0)).toBe(false);
  });

  it('ignores a zero movement', () => {
    expect(crossedIntoStock(0, 5)).toBe(false);
  });
});
