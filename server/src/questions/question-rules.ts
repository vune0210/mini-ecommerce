import { UserRole } from '../users/entities/user.entity';

/**
 * Who is acting, as far as a permission rule is concerned. Structural on
 * purpose so the rules stay callable from a unit test without a `users` row.
 */
export type Actor = { id: string; role: UserRole };

/**
 * Trims and collapses runs of whitespace. Applied before storage because
 * MaxLength counts blank characters: without this a body of newlines passes
 * validation and then renders as a wall of empty lines on the product page.
 */
export function normalizeBody(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Whether an answer written by this role carries the shop's badge. Derived from
 * the author's role at write time and never from the request body — otherwise
 * any customer could badge their own answer as the shop speaking. The service
 * snapshots the result onto the row; see ProductAnswer.isOfficial for why the
 * snapshot is not re-derived on read.
 */
export function isOfficialAuthor(role: UserRole): boolean {
  return role === UserRole.ADMIN;
}

/**
 * Editing is author-only, admins included: moderation is allowed to hide text,
 * never to put different words in someone's mouth under their name.
 */
export function canEditContent(authorId: string, actor: Actor): boolean {
  return authorId === actor.id;
}

/** Deletion is author-or-admin — removal is a moderation power, editing is not. */
export function canDeleteContent(authorId: string, actor: Actor): boolean {
  return authorId === actor.id || actor.role === UserRole.ADMIN;
}

/** Self-votes would make "helpful" a measure of who clicks their own answer. */
export function canVoteOn(authorId: string, voterId: string): boolean {
  return authorId !== voterId;
}

type DisplayOrder = {
  isOfficial: boolean;
  helpfulCount: number;
  createdAt: Date;
};

/**
 * Official answers first, then the most helpful, then oldest first so a thread
 * still reads in the order it was written. Sorted in memory rather than in SQL
 * because one query fetches the answers for a whole page of questions, and
 * ordering within each question in the database would need a window function.
 */
export function sortAnswersForDisplay<T extends DisplayOrder>(
  answers: readonly T[],
): T[] {
  return [...answers].sort((left, right) => {
    if (left.isOfficial !== right.isOfficial) return left.isOfficial ? -1 : 1;
    if (left.helpfulCount !== right.helpfulCount)
      return right.helpfulCount - left.helpfulCount;
    return left.createdAt.getTime() - right.createdAt.getTime();
  });
}

/**
 * Buckets the one answers query back onto its questions. Insertion order is
 * preserved, so grouping an already-sorted list leaves every bucket sorted and
 * the caller does not have to sort again per question.
 */
export function groupAnswersByQuestion<T extends { questionId: string }>(
  answers: readonly T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const answer of answers) {
    const bucket = grouped.get(answer.questionId) ?? [];
    bucket.push(answer);
    grouped.set(answer.questionId, bucket);
  }
  return grouped;
}

/**
 * How `product_questions.answer_count` moves when one answer's moderation state
 * changes. The counter tracks visible answers only, so hiding one has to
 * decrement it — otherwise the storefront advertises answers nobody can read
 * and the moderation queue stops surfacing questions that need a reply.
 *
 * Zero when the state did not actually change: re-hiding an already hidden
 * answer must not drive an unsigned column below the rows backing it.
 */
export function visibleAnswerCountDelta(
  wasHidden: boolean,
  nowHidden: boolean,
): number {
  if (wasHidden === nowHidden) return 0;
  return wasHidden ? 1 : -1;
}
