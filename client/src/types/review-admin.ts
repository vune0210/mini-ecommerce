import type { Review, ReviewSort } from './catalog';

/**
 * Mirrors server ModeratedReview: the public projection plus the state staff
 * act on. `productName` is null when the product row is gone but its reviews
 * are still queued. Reviewer emails are never exposed — only `author.name`.
 */
export type AdminReview = Review & {
  isHidden: boolean;
  productId: string;
  productName: string | null;
};

export type AdminReviewListResponse = {
  items: AdminReview[];
  total: number;
  page: number;
  limit: number;
};

/** Empty string means "no filter" — the param is dropped from the query. */
export type ReviewRatingFilter = '' | '1' | '2' | '3' | '4' | '5';
export type ReviewHiddenFilter = '' | 'true' | 'false';

export type AdminReviewQuery = {
  page: number;
  /** A product id, set by drilling into a row — never free text (API wants a UUID). */
  productId: string;
  isHidden: ReviewHiddenFilter;
  rating: ReviewRatingFilter;
  /** Only reviews carrying a written comment. False is omitted, not sent. */
  withComment: boolean;
  sort: ReviewSort;
};

/** Hiding is reversible: the row is kept, only its visibility flips. */
export type ModerateReviewInput = { id: string; isHidden: boolean };
