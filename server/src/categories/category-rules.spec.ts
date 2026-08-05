import {
  buildCategoryTree,
  descendantIdsOf,
  wouldCreateCycle,
} from './category-rules';

/**
 *   electronics
 *     laptops
 *       gaming-laptops
 *     phones
 *   books
 */
const catalogue = [
  { id: 'electronics', parentId: null },
  { id: 'laptops', parentId: 'electronics' },
  { id: 'gaming-laptops', parentId: 'laptops' },
  { id: 'phones', parentId: 'electronics' },
  { id: 'books', parentId: null },
];

describe('descendantIdsOf', () => {
  it('includes the root itself so the result can be used directly in an IN clause', () => {
    expect(descendantIdsOf(catalogue, 'laptops')).toEqual([
      'laptops',
      'gaming-laptops',
    ]);
  });

  it('walks more than one level', () => {
    expect(descendantIdsOf(catalogue, 'electronics').sort()).toEqual(
      ['electronics', 'gaming-laptops', 'laptops', 'phones'].sort(),
    );
  });

  it('returns just the leaf when nothing hangs off it', () => {
    expect(descendantIdsOf(catalogue, 'books')).toEqual(['books']);
  });

  it('returns the unknown id unchanged rather than an empty scope', () => {
    // An empty array would widen `IN (...)` to match nothing, silently turning
    // a bad filter into an empty catalogue page.
    expect(descendantIdsOf(catalogue, 'missing')).toEqual(['missing']);
  });

  /** A cycle can only arrive through direct SQL, but must not hang the API. */
  it('terminates on a cycle written outside the API', () => {
    const looped = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ];
    expect(descendantIdsOf(looped, 'a').sort()).toEqual(['a', 'b']);
  });
});

describe('buildCategoryTree', () => {
  it('nests children under their parent', () => {
    const roots = buildCategoryTree(catalogue);
    expect(roots.map((node) => node.id)).toEqual(['electronics', 'books']);
    const electronics = roots[0];
    expect(electronics.children.map((node) => node.id)).toEqual([
      'laptops',
      'phones',
    ]);
    expect(electronics.children[0].children.map((node) => node.id)).toEqual([
      'gaming-laptops',
    ]);
  });

  it('surfaces an orphan at the root instead of dropping it', () => {
    const roots = buildCategoryTree([{ id: 'lost', parentId: 'gone' }]);
    expect(roots.map((node) => node.id)).toEqual(['lost']);
  });

  it('does not nest a self-parented row inside itself', () => {
    const roots = buildCategoryTree([{ id: 'self', parentId: 'self' }]);
    expect(roots).toHaveLength(1);
    expect(roots[0].children).toEqual([]);
  });
});

describe('wouldCreateCycle', () => {
  it('refuses a category as its own parent', () => {
    expect(wouldCreateCycle(catalogue, 'laptops', 'laptops')).toBe(true);
  });

  it('refuses moving a category under its own descendant', () => {
    expect(wouldCreateCycle(catalogue, 'electronics', 'gaming-laptops')).toBe(
      true,
    );
  });

  it('allows an unrelated move', () => {
    expect(wouldCreateCycle(catalogue, 'books', 'electronics')).toBe(false);
  });
});
