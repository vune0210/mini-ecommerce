import {
  averageRating,
  emptyRatingDistribution,
  ratingSummaries,
  summaryFromRatingCounts,
} from './review-rules';

describe('review rules', () => {
  it('rounds the average to one decimal and treats no reviews as zero', () => {
    expect(averageRating(10, 3)).toBe(3.3);
    expect(averageRating(9, 2)).toBe(4.5);
    expect(averageRating(0, 0)).toBe(0);
    expect(averageRating(5, -1)).toBe(0);
  });

  it('maps grouped product rows to per-product summaries', () => {
    expect(
      ratingSummaries([
        { productId: 'a', sum: '9', count: '2' },
        { productId: 'b', sum: null, count: null },
      ]),
    ).toEqual({
      a: { averageRating: 4.5, reviewCount: 2 },
      b: { averageRating: 0, reviewCount: 0 },
    });
  });

  it('builds a full distribution and ignores out-of-range ratings', () => {
    expect(
      summaryFromRatingCounts([
        { rating: '5', count: '2' },
        { rating: 3, count: 1 },
        { rating: 9, count: 4 },
      ]),
    ).toEqual({
      averageRating: 4.3,
      reviewCount: 3,
      distribution: { ...emptyRatingDistribution(), '3': 1, '5': 2 },
    });
  });

  it('returns an all-zero summary when a product has no reviews', () => {
    expect(summaryFromRatingCounts([])).toEqual({
      averageRating: 0,
      reviewCount: 0,
      distribution: emptyRatingDistribution(),
    });
  });
});
