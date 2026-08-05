import { CornerDownRight, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '../ui';
import type { CategoryNode } from '../../types/catalog';

export type FlatCategory = { category: CategoryNode; depth: number };

/**
 * Depth-first walk of the tree. The select controls and the list both need the
 * same order — deriving them from one walk keeps the parent picker and the rows
 * showing the hierarchy identically.
 */
export function flattenCategories(nodes: CategoryNode[], depth = 0): FlatCategory[] {
  return nodes.flatMap((category) => [
    { category, depth },
    ...flattenCategories(category.children, depth + 1),
  ]);
}

/** The category and everything beneath it — the branch a move must not enter. */
export function subtreeIds(node: CategoryNode): string[] {
  return [node.id, ...node.children.flatMap(subtreeIds)];
}

type Props = {
  nodes: CategoryNode[];
  editingId: string | null;
  busy: boolean;
  onEdit: (category: CategoryNode) => void;
  onDelete: (category: CategoryNode) => void;
};

export function CategoryTree({ nodes, editingId, busy, onEdit, onDelete }: Props) {
  const rows = flattenCategories(nodes);

  return (
    <ul role="tree" className="divide-y divide-slate-50">
      {rows.map(({ category, depth }) => (
        <li
          role="treeitem"
          aria-level={depth + 1}
          aria-expanded={category.children.length ? true : undefined}
          key={category.id}
          className={`flex flex-wrap items-center gap-3 py-3 pr-5 transition-colors hover:bg-slate-50/60 ${
            editingId === category.id ? 'bg-brand-50/40' : ''
          }`}
          // Indentation is the whole point of the tree view, so it is a computed
          // inset rather than one Tailwind class per possible depth.
          style={{ paddingLeft: 20 + depth * 22 }}
        >
          {depth > 0 && (
            <CornerDownRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-slate-900">{category.name}</span>
            <code className="mt-0.5 block truncate font-mono text-xs text-slate-400">
              {category.slug}
            </code>
          </span>
          <Badge tone={category.productCount ? 'slate' : 'brand'}>
            {category.productCount ?? 0} sản phẩm
          </Badge>
          {category.children.length > 0 && (
            <Badge tone="violet">{category.children.length} danh mục con</Badge>
          )}
          <span className="flex gap-1">
            <button
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
              onClick={() => onEdit(category)}
              aria-label={`Sửa ${category.name}`}
            >
              <Pencil className="h-4 w-4" aria-hidden />
            </button>
            <button
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              disabled={busy}
              onClick={() => onDelete(category)}
              aria-label={`Xóa ${category.name}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}
