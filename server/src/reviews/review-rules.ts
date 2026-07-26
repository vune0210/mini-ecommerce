export type RatingAggregate = { averageRating: number; reviewCount: number };
export type RatingDistribution = Record<'1' | '2' | '3' | '4' | '5', number>;
export type RatingSummary = RatingAggregate & {
  distribution: RatingDistribution;
};

export function emptyRatingAggregate(): RatingAggregate {
  return { averageRating: 0, reviewCount: 0 };
}

export function emptyRatingDistribution(): RatingDistribution {
  return { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
}

/** Rounded to one decimal place; 0 when there is nothing to average. */
export function averageRating(sum: number, count: number): number {
  if (count <= 0) return 0;
  return Math.round((sum / count) * 10) / 10;
}

/** Maps `GROUP BY product_id` aggregate rows to per-product summaries. */
export function ratingSummaries(
  rows: Array<{
    productId: string;
    sum: string | number | null;
    count: string | number | null;
  }>,
): Record<string, RatingAggregate> {
  const summaries: Record<string, RatingAggregate> = {};
  for (const row of rows) {
    const count = Number(row.count ?? 0);
    summaries[row.productId] = {
      averageRating: averageRating(Number(row.sum ?? 0), count),
      reviewCount: count,
    };
  }
  return summaries;
}

/** Builds a full summary from `GROUP BY rating` aggregate rows of one product. */
export function summaryFromRatingCounts(
  rows: Array<{ rating: string | number; count: string | number }>,
): RatingSummary {
  const distribution = emptyRatingDistribution();
  let sum = 0;
  let count = 0;
  for (const row of rows) {
    const rating = Number(row.rating);
    const occurrences = Number(row.count);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) continue;
    distribution[String(rating) as keyof RatingDistribution] += occurrences;
    sum += rating * occurrences;
    count += occurrences;
  }
  return {
    averageRating: averageRating(sum, count),
    reviewCount: count,
    distribution,
  };
}
