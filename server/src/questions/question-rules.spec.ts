import { UserRole } from '../users/entities/user.entity';
import {
  canDeleteContent,
  canEditContent,
  canVoteOn,
  groupAnswersByQuestion,
  isOfficialAuthor,
  normalizeBody,
  sortAnswersForDisplay,
  visibleAnswerCountDelta,
} from './question-rules';

const customer = { id: 'customer-1', role: UserRole.CUSTOMER };
const admin = { id: 'admin-1', role: UserRole.ADMIN };

describe('normalizeBody', () => {
  it('trims and collapses whitespace runs', () => {
    expect(normalizeBody('  Con hang   khong ?\n\n ')).toBe('Con hang khong ?');
  });

  it('reduces a body of only whitespace to the empty string', () => {
    // The caller relies on this to reject a body that passed MaxLength purely
    // on blank characters.
    expect(normalizeBody(' \n\t ')).toBe('');
  });
});

describe('isOfficialAuthor', () => {
  it('badges an admin answer and nothing else', () => {
    expect(isOfficialAuthor(UserRole.ADMIN)).toBe(true);
    expect(isOfficialAuthor(UserRole.CUSTOMER)).toBe(false);
  });
});

describe('canEditContent', () => {
  it('allows the author', () => {
    expect(canEditContent('customer-1', customer)).toBe(true);
  });

  it('refuses everyone else, an admin included', () => {
    expect(canEditContent('customer-2', customer)).toBe(false);
    expect(canEditContent('customer-1', admin)).toBe(false);
  });
});

describe('canDeleteContent', () => {
  it('allows the author', () => {
    expect(canDeleteContent('customer-1', customer)).toBe(true);
  });

  it('allows an admin to delete someone else content', () => {
    expect(canDeleteContent('customer-1', admin)).toBe(true);
  });

  it('refuses an unrelated customer', () => {
    expect(canDeleteContent('customer-2', customer)).toBe(false);
  });
});

describe('canVoteOn', () => {
  it('refuses a vote on your own answer', () => {
    expect(canVoteOn('customer-1', 'customer-1')).toBe(false);
  });

  it('allows a vote on someone else answer', () => {
    expect(canVoteOn('customer-1', 'customer-2')).toBe(true);
  });
});

describe('sortAnswersForDisplay', () => {
  const answer = (
    id: string,
    isOfficial: boolean,
    helpfulCount: number,
    day: number,
  ) => ({
    id,
    isOfficial,
    helpfulCount,
    createdAt: new Date(2026, 0, day),
  });

  it('puts official answers first however unpopular they are', () => {
    const sorted = sortAnswersForDisplay([
      answer('popular', false, 99, 1),
      answer('official', true, 0, 5),
    ]);
    expect(sorted.map((row) => row.id)).toEqual(['official', 'popular']);
  });

  it('orders by helpfulness within a badge group, oldest first on a tie', () => {
    const sorted = sortAnswersForDisplay([
      answer('c', false, 1, 3),
      answer('a', false, 4, 2),
      answer('b', false, 1, 1),
    ]);
    expect(sorted.map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('ranks two official answers against each other too', () => {
    const sorted = sortAnswersForDisplay([
      answer('quiet', true, 0, 1),
      answer('loud', true, 3, 2),
    ]);
    expect(sorted.map((row) => row.id)).toEqual(['loud', 'quiet']);
  });

  it('does not mutate the caller array', () => {
    const input = [answer('a', false, 1, 1), answer('b', true, 0, 2)];
    sortAnswersForDisplay(input);
    expect(input.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('handles an empty thread', () => {
    expect(sortAnswersForDisplay([])).toEqual([]);
  });
});

describe('groupAnswersByQuestion', () => {
  it('buckets answers under their question', () => {
    const grouped = groupAnswersByQuestion([
      { id: '1', questionId: 'q1' },
      { id: '2', questionId: 'q2' },
      { id: '3', questionId: 'q1' },
    ]);
    expect(grouped.get('q1')?.map((row) => row.id)).toEqual(['1', '3']);
    expect(grouped.get('q2')?.map((row) => row.id)).toEqual(['2']);
  });

  it('preserves input order so a pre-sorted list stays sorted', () => {
    const grouped = groupAnswersByQuestion([
      { id: 'second', questionId: 'q1' },
      { id: 'first', questionId: 'q1' },
    ]);
    expect(grouped.get('q1')?.map((row) => row.id)).toEqual([
      'second',
      'first',
    ]);
  });

  it('reports a question with no answers as absent rather than empty', () => {
    expect(groupAnswersByQuestion([]).get('q1')).toBeUndefined();
  });
});

describe('visibleAnswerCountDelta', () => {
  it('discounts an answer that is being hidden', () => {
    expect(visibleAnswerCountDelta(false, true)).toBe(-1);
  });

  it('counts an answer that is being restored', () => {
    expect(visibleAnswerCountDelta(true, false)).toBe(1);
  });

  it('moves nothing when the state is unchanged', () => {
    // A repeated hide must not push the unsigned counter below the rows
    // backing it.
    expect(visibleAnswerCountDelta(true, true)).toBe(0);
    expect(visibleAnswerCountDelta(false, false)).toBe(0);
  });
});
