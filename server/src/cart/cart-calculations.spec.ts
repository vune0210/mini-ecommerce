import { cartTotals } from './cart-calculations';
describe('cartTotals', () => {
  it('calculates decimal subtotals, amount and item count', () => {
    expect(
      cartTotals([
        { quantity: 2, product: { price: '19.99' } },
        { quantity: 3, product: { price: '5.00' } },
      ]),
    ).toEqual({
      subtotals: ['39.98', '15.00'],
      totalItems: 5,
      totalAmount: '54.98',
    });
  });
});
