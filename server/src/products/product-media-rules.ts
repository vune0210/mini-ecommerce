/**
 * Pure catalogue-media rules: how a tag label becomes a slug, and the ordering
 * and primary-image invariants of a product gallery. They live outside the
 * services so the awkward cases — a reorder naming half the gallery, a primary
 * that was just deleted, a Vietnamese tag name — are testable without a
 * database, which is where those cases are cheap to get wrong.
 */

/** Matches `product_tags.slug` varchar(60): a slug is truncated, never rejected. */
export const TAG_SLUG_MAX_LENGTH = 60;

/**
 * URL-safe label for a tag. Diacritics are folded rather than stripped so that
 * "Bán chạy" becomes `ban-chay` and not `b-n-ch-y` — this catalogue is
 * Vietnamese, and a slug of leftover consonants is neither readable nor
 * linkable. `đ` is handled separately because it is a distinct letter, not a
 * `d` carrying a mark, so NFD leaves it whole.
 *
 * Returns '' when nothing survives normalization; callers decide whether an
 * unslugifiable name is an error or simply skipped.
 */
export function normalizeTagSlug(input: string): string {
  const folded = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd');
  return folded
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, TAG_SLUG_MAX_LENGTH)
    .replace(/-+$/, '');
}

/**
 * Splits the `?tags=` filter. Every entry goes through the same normalizer the
 * writer used, so a link pasted with a capital or a stray space still matches
 * the stored slug instead of quietly returning an empty catalogue page.
 * Duplicates collapse: `?tags=sale,sale` must not demand the tag twice.
 */
export function parseTagSlugs(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const slugs: string[] = [];
  for (const part of raw.split(',')) {
    const slug = normalizeTagSlug(part);
    if (slug && !slugs.includes(slug)) slugs.push(slug);
  }
  return slugs;
}

/** The difference between the tags a product has and the set it should end with. */
export function diffTagIds(
  current: readonly string[],
  desired: readonly string[],
): { added: string[]; removed: string[] } {
  const currentSet = new Set(current);
  const desiredSet = new Set(desired);
  return {
    added: [...desiredSet].filter((id) => !currentSet.has(id)),
    removed: [...currentSet].filter((id) => !desiredSet.has(id)),
  };
}

/** The gallery fields every ordering rule below needs. */
export type GalleryImage = { id: string; position: number; isPrimary: boolean };

/**
 * Display order. The id tiebreak is not decoration: positions are only dense
 * and unique between mutations, and two images sharing a position must still
 * render in the same order on every request, or a page reload reshuffles the
 * gallery.
 */
export function sortGallery<T extends GalleryImage>(images: readonly T[]): T[] {
  return [...images].sort((left, right) => {
    if (left.position !== right.position) return left.position - right.position;
    if (left.id === right.id) return 0;
    return left.id < right.id ? -1 : 1;
  });
}

/** Where an appended image goes: after everything already there. */
export function nextGalleryPosition(
  images: readonly { position: number }[],
): number {
  return images.reduce(
    (highest, image) => Math.max(highest, image.position + 1),
    0,
  );
}

/**
 * Renumbers a gallery to a dense 0..n-1. Ids the caller did not mention keep
 * their relative order behind the ones that were named, so a client that knows
 * about three images cannot silently drop the two added since it last loaded.
 * Unknown and repeated ids are ignored rather than shifting everything after
 * them by an empty slot.
 */
export function renumberPositions<T extends GalleryImage>(
  images: readonly T[],
  orderedIds: readonly string[],
): Array<{ id: string; position: number }> {
  const known = new Set(images.map((image) => image.id));
  const placed: string[] = [];
  const seen = new Set<string>();
  for (const id of orderedIds) {
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    placed.push(id);
  }
  for (const image of sortGallery(images))
    if (!seen.has(image.id)) placed.push(image.id);
  return placed.map((id, index) => ({ id, position: index }));
}

/**
 * The id order after moving one image to a given slot. Expressed as a move
 * rather than "write position = n" because two images would then share a slot
 * and the tiebreak — not the admin — would decide which came first.
 * A target past either end clamps instead of failing: "put it last" is a
 * reasonable thing to mean by a number larger than the gallery.
 */
export function moveToPosition<T extends GalleryImage>(
  images: readonly T[],
  imageId: string,
  target: number,
): string[] {
  const ordered = sortGallery(images).map((image) => image.id);
  const from = ordered.indexOf(imageId);
  if (from === -1) return ordered;
  ordered.splice(from, 1);
  const clamped = Math.max(0, Math.min(Math.trunc(target), ordered.length));
  ordered.splice(clamped, 0, imageId);
  return ordered;
}

/**
 * Which image must carry `is_primary` after a change. An explicit request wins
 * when it names an image of this gallery; otherwise the existing flag stands;
 * otherwise the first image is promoted. A non-empty gallery never resolves to
 * null, because a product with pictures and no primary shows an empty
 * thumbnail everywhere `products.image_url` is still read.
 */
export function resolvePrimaryImageId<T extends GalleryImage>(
  images: readonly T[],
  requestedId?: string | null,
): string | null {
  const ordered = sortGallery(images);
  if (!ordered.length) return null;
  if (requestedId && ordered.some((image) => image.id === requestedId))
    return requestedId;
  return (ordered.find((image) => image.isPrimary) ?? ordered[0]).id;
}

/**
 * The value the legacy `products.image_url` must mirror. Resolved rather than
 * read off the flag so an inconsistent gallery — two primaries, or none —
 * still yields the same picture the gallery itself renders first.
 */
export function primaryImageUrl<T extends GalleryImage & { url: string }>(
  images: readonly T[],
): string | null {
  const primaryId = resolvePrimaryImageId(images);
  return images.find((image) => image.id === primaryId)?.url ?? null;
}
