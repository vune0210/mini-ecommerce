export type CategoryNode<T> = T & { children: CategoryNode<T>[] };

type Linkable = { id: string; parentId: string | null };

/**
 * Collects a category and everything beneath it. Walks a map built once rather
 * than issuing one query per level: the table is small, and a recursive CTE
 * would tie the catalogue to MySQL 8.
 *
 * The `seen` set is not paranoia — the API refuses to create a cycle, but a
 * row edited directly in SQL could still form one, and an infinite loop in a
 * product listing is a far worse outcome than a truncated subtree.
 */
export function descendantIdsOf<T extends Linkable>(
  categories: readonly T[],
  rootId: string,
): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    const siblings = childrenByParent.get(category.parentId) ?? [];
    siblings.push(category.id);
    childrenByParent.set(category.parentId, siblings);
  }
  const collected: string[] = [];
  const seen = new Set<string>();
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    collected.push(current);
    queue.push(...(childrenByParent.get(current) ?? []));
  }
  return collected;
}

/**
 * Nests a flat list. Orphans — rows whose parent is missing or outside the
 * given set — are surfaced at the root rather than dropped, so a broken link
 * makes a category look misplaced instead of making it disappear.
 */
export function buildCategoryTree<T extends Linkable>(
  categories: readonly T[],
): CategoryNode<T>[] {
  const nodes = new Map<string, CategoryNode<T>>(
    categories.map((category) => [category.id, { ...category, children: [] }]),
  );
  const roots: CategoryNode<T>[] = [];
  for (const category of categories) {
    const node = nodes.get(category.id)!;
    const parent = category.parentId ? nodes.get(category.parentId) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/**
 * True when re-parenting `categoryId` under `parentId` would create a loop —
 * either directly (a category as its own parent) or by moving a category into
 * its own subtree, which detaches that whole branch from the root.
 */
export function wouldCreateCycle<T extends Linkable>(
  categories: readonly T[],
  categoryId: string,
  parentId: string,
): boolean {
  if (categoryId === parentId) return true;
  return descendantIdsOf(categories, categoryId).includes(parentId);
}
