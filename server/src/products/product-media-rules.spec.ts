import {
  diffTagIds,
  moveToPosition,
  nextGalleryPosition,
  normalizeTagSlug,
  parseTagSlugs,
  primaryImageUrl,
  renumberPositions,
  resolvePrimaryImageId,
  sortGallery,
  TAG_SLUG_MAX_LENGTH,
} from './product-media-rules';

/** Compact gallery fixtures: id, position, whether the row is flagged primary. */
const image = (id: string, position: number, isPrimary = false) => ({
  id,
  position,
  isPrimary,
});

describe('normalizeTagSlug', () => {
  it('lowercases and hyphenates a plain label', () => {
    expect(normalizeTagSlug('New Arrival')).toBe('new-arrival');
  });

  it('folds Vietnamese diacritics instead of dropping the letters', () => {
    // 'b-n-ch-y' would be neither readable nor guessable from the label.
    expect(normalizeTagSlug('Bán chạy')).toBe('ban-chay');
  });

  it('folds đ, which NFD leaves whole because it is its own letter', () => {
    expect(normalizeTagSlug('Đồ điện tử')).toBe('do-dien-tu');
  });

  it('collapses runs of punctuation into a single hyphen', () => {
    expect(normalizeTagSlug('sale -- 50%  off!!')).toBe('sale-50-off');
  });

  it('trims leading and trailing separators', () => {
    expect(normalizeTagSlug('  --hot--  ')).toBe('hot');
  });

  it('accepts an already valid slug unchanged', () => {
    expect(normalizeTagSlug('new-arrival')).toBe('new-arrival');
  });

  it('truncates to the column width without leaving a trailing hyphen', () => {
    const slug = normalizeTagSlug(`${'a'.repeat(TAG_SLUG_MAX_LENGTH)} tail`);
    expect(slug).toHaveLength(TAG_SLUG_MAX_LENGTH);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('returns empty when nothing survives, so callers can reject the label', () => {
    expect(normalizeTagSlug('!!!')).toBe('');
    expect(normalizeTagSlug('   ')).toBe('');
  });
});

describe('parseTagSlugs', () => {
  it('splits, trims and normalizes each entry', () => {
    expect(parseTagSlugs('Sale, New Arrival')).toEqual(['sale', 'new-arrival']);
  });

  it('drops empty segments left by stray commas', () => {
    expect(parseTagSlugs('sale,,')).toEqual(['sale']);
  });

  it('collapses duplicates so a tag is not demanded twice', () => {
    // The ALL filter compares a count against the list length; a repeat would
    // raise the bar to two matches on a link table that can only ever have one.
    expect(parseTagSlugs('sale,SALE, sale ')).toEqual(['sale']);
  });

  it('treats a missing or empty filter as no filter at all', () => {
    expect(parseTagSlugs(undefined)).toEqual([]);
    expect(parseTagSlugs(null)).toEqual([]);
    expect(parseTagSlugs('')).toEqual([]);
    expect(parseTagSlugs(' , ')).toEqual([]);
  });
});

describe('diffTagIds', () => {
  it('reports only what actually changes', () => {
    expect(diffTagIds(['a', 'b'], ['b', 'c'])).toEqual({
      added: ['c'],
      removed: ['a'],
    });
  });

  it('is a no-op when the set is unchanged, so no link row is rewritten', () => {
    expect(diffTagIds(['a', 'b'], ['b', 'a'])).toEqual({
      added: [],
      removed: [],
    });
  });

  it('treats an empty desired set as clearing every tag', () => {
    expect(diffTagIds(['a', 'b'], [])).toEqual({
      added: [],
      removed: ['a', 'b'],
    });
  });

  it('deduplicates a repeated id rather than inserting it twice', () => {
    expect(diffTagIds([], ['a', 'a'])).toEqual({ added: ['a'], removed: [] });
  });
});

describe('sortGallery', () => {
  it('orders by position', () => {
    const sorted = sortGallery([image('c', 2), image('a', 0), image('b', 1)]);
    expect(sorted.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });

  it('breaks a shared position by id so a reload does not reshuffle', () => {
    const sorted = sortGallery([image('b', 0), image('a', 0)]);
    expect(sorted.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('does not mutate its input', () => {
    const gallery = [image('b', 1), image('a', 0)];
    sortGallery(gallery);
    expect(gallery.map((entry) => entry.id)).toEqual(['b', 'a']);
  });
});

describe('nextGalleryPosition', () => {
  it('starts an empty gallery at zero', () => {
    expect(nextGalleryPosition([])).toBe(0);
  });

  it('lands after the highest position, not after the count', () => {
    // A gallery left sparse by a partial write must still append at the end.
    expect(nextGalleryPosition([{ position: 0 }, { position: 7 }])).toBe(8);
  });
});

describe('renumberPositions', () => {
  const gallery = [image('a', 0), image('b', 1), image('c', 2)];

  it('applies the requested order as dense positions', () => {
    expect(renumberPositions(gallery, ['c', 'a', 'b'])).toEqual([
      { id: 'c', position: 0 },
      { id: 'a', position: 1 },
      { id: 'b', position: 2 },
    ]);
  });

  it('keeps unnamed images behind the named ones in their existing order', () => {
    // A client that only knows about 'c' must not bury the images it never saw.
    expect(renumberPositions(gallery, ['c'])).toEqual([
      { id: 'c', position: 0 },
      { id: 'a', position: 1 },
      { id: 'b', position: 2 },
    ]);
  });

  it('ignores ids that are not in the gallery', () => {
    expect(renumberPositions(gallery, ['ghost', 'b'])).toEqual([
      { id: 'b', position: 0 },
      { id: 'a', position: 1 },
      { id: 'c', position: 2 },
    ]);
  });

  it('ignores a repeated id rather than leaving a gap behind it', () => {
    expect(renumberPositions(gallery, ['b', 'b'])).toEqual([
      { id: 'b', position: 0 },
      { id: 'a', position: 1 },
      { id: 'c', position: 2 },
    ]);
  });

  it('compacts sparse positions even when no order is requested', () => {
    expect(renumberPositions([image('a', 4), image('b', 9)], [])).toEqual([
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
    ]);
  });

  it('returns nothing for an empty gallery', () => {
    expect(renumberPositions([], ['a'])).toEqual([]);
  });
});

describe('moveToPosition', () => {
  const gallery = [image('a', 0), image('b', 1), image('c', 2)];

  it('moves an image later and closes the gap it left', () => {
    expect(moveToPosition(gallery, 'a', 2)).toEqual(['b', 'c', 'a']);
  });

  it('moves an image earlier', () => {
    expect(moveToPosition(gallery, 'c', 0)).toEqual(['c', 'a', 'b']);
  });

  it('clamps a target past the end to last', () => {
    expect(moveToPosition(gallery, 'a', 99)).toEqual(['b', 'c', 'a']);
  });

  it('clamps a negative target to first', () => {
    expect(moveToPosition(gallery, 'c', -5)).toEqual(['c', 'a', 'b']);
  });

  it('leaves the order alone when the image is not in the gallery', () => {
    expect(moveToPosition(gallery, 'ghost', 0)).toEqual(['a', 'b', 'c']);
  });

  it('is a no-op when the image is already in that slot', () => {
    expect(moveToPosition(gallery, 'b', 1)).toEqual(['a', 'b', 'c']);
  });
});

describe('resolvePrimaryImageId', () => {
  it('has no primary for an empty gallery', () => {
    expect(resolvePrimaryImageId([])).toBeNull();
  });

  it('honours an explicit request', () => {
    expect(
      resolvePrimaryImageId([image('a', 0, true), image('b', 1)], 'b'),
    ).toBe('b');
  });

  it('ignores a request naming an image of some other gallery', () => {
    expect(
      resolvePrimaryImageId([image('a', 0, true), image('b', 1)], 'ghost'),
    ).toBe('a');
  });

  it('keeps the existing primary when nothing is requested', () => {
    expect(resolvePrimaryImageId([image('a', 0), image('b', 1, true)])).toBe(
      'b',
    );
  });

  it('promotes the first image when the primary was just deleted', () => {
    expect(resolvePrimaryImageId([image('b', 1), image('c', 2)])).toBe('b');
  });

  it('settles two flagged rows on the earlier one', () => {
    // Only reachable through a row edited outside the API, but it must resolve
    // to something stable rather than whichever row the driver returned first.
    expect(
      resolvePrimaryImageId([image('b', 1, true), image('a', 0, true)]),
    ).toBe('a');
  });
});

describe('primaryImageUrl', () => {
  const withUrl = (id: string, position: number, isPrimary = false) => ({
    ...image(id, position, isPrimary),
    url: `https://cdn.example.com/${id}.jpg`,
  });

  it('mirrors the flagged image', () => {
    expect(primaryImageUrl([withUrl('a', 0), withUrl('b', 1, true)])).toBe(
      'https://cdn.example.com/b.jpg',
    );
  });

  it('falls back to the first image when none is flagged', () => {
    expect(primaryImageUrl([withUrl('b', 1), withUrl('a', 0)])).toBe(
      'https://cdn.example.com/a.jpg',
    );
  });

  it('clears the legacy field when the gallery is emptied', () => {
    // Keeping the old URL would serve a picture the admin just deleted.
    expect(primaryImageUrl([])).toBeNull();
  });
});
