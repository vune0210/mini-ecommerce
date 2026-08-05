/**
 * Mirrors the server's `PublicAnswer`. The API only ever exposes the author's
 * display name — an answerer's email never leaves the server.
 */
export type Answer = {
  id: string;
  questionId: string;
  body: string;
  author: { id: string; name: string };
  /** Derived from the author's role when the answer was written, never from the
   *  payload — the badge means "the shop is speaking". */
  isOfficial: boolean;
  helpfulCount: number;
  createdAt: string;
  updatedAt: string;
};

/** Mirrors `PublicQuestion`. Same privacy contract: display name only. */
export type Question = {
  id: string;
  productId: string;
  body: string;
  author: { id: string; name: string };
  /**
   * Counts *visible* answers only. A question whose only answer was moderated
   * away is back to zero here — which is why "chưa có trả lời" stays honest.
   * It therefore always matches `answers.length` on the storefront payload.
   */
  answerCount: number;
  /** Visible answers, official ones first, then most helpful, then oldest. */
  answers: Answer[];
  createdAt: string;
  updatedAt: string;
};

/** The moderation projections: the public shape plus the state staff act on. */
export type ModeratedAnswer = Answer & { isHidden: boolean };

export type ModeratedQuestion = Omit<Question, 'answers'> & {
  isHidden: boolean;
  /** Null when the product row is gone but its thread is still queued. */
  productName: string | null;
  /** Hidden answers included — the queue is where they are acted on. */
  answers: ModeratedAnswer[];
};

/**
 * Ordering, never a filter: `answered`/`unanswered` decide which end of the
 * list replied-to threads sit at. Only the admin `unansweredOnly` removes rows.
 */
export type QuestionSort = 'newest' | 'answered' | 'unanswered';

export type QuestionListResponse = {
  items: Question[];
  total: number;
  page: number;
  limit: number;
};

export type AdminQuestionListResponse = {
  items: ModeratedQuestion[];
  total: number;
  page: number;
  limit: number;
};

/** Empty string means "no filter" — the param is dropped from the query. */
export type QuestionHiddenFilter = '' | 'true' | 'false';

export type AdminQuestionQuery = {
  page: number;
  /** A product id, set by drilling into a row — never free text (API wants a UUID). */
  productId: string;
  isHidden: QuestionHiddenFilter;
  /** The one real filter in this feature: keeps only questions with no visible answer. */
  unansweredOnly: boolean;
  sort: QuestionSort;
};

/** Hiding is reversible: the row is kept, only its visibility flips. */
export type SetVisibilityInput = { id: string; isHidden: boolean };

/** Both PATCH endpoints accept a body and nothing else. */
export type UpdateBodyInput = { id: string; body: string };
