import { Pencil, Plus, Tags, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { AdminShell } from '../components/AdminShell';
import { CategoryTree, flattenCategories, subtreeIds } from '../components/admin/CategoryTree';
import { Alert, Badge, PageHeader, Panel, Skeleton } from '../components/ui';
import {
  adminError,
  adminErrorStatus,
  useCategoryTree,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '../lib/admin-api';
import { slugify } from '../lib/format';
import type { CategoryNode } from '../types/catalog';

export function AdminCategoriesPage() {
  const categories = useCategoryTree();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [editing, setEditing] = useState<CategoryNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = flattenCategories(categories.data ?? []);
  // A category cannot become its own ancestor, so its whole branch is off the
  // parent list. Disabling the options explains the rule before the server has
  // to; the 400 handler below covers a tree that went stale in the meantime.
  const forbidden = new Set(editing ? subtreeIds(editing) : []);

  function reset(): void {
    setEditing(null);
    setName('');
    setParentId('');
    setError(null);
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (!name.trim()) {
      setError('Tên danh mục là bắt buộc.');
      return;
    }
    setError(null);
    const input = { name: name.trim(), slug: slugify(name), parentId: parentId || null };
    const callbacks = {
      onSuccess: () => {
        setName('');
        setParentId('');
        setEditing(null);
      },
      onError: (reason: unknown) => {
        if (adminErrorStatus(reason) === 400)
          setError(
            'Không thể chuyển một danh mục vào chính nhánh con của nó — cả nhánh sẽ mất đường về gốc và không còn hiển thị ở đâu. Hãy chọn danh mục cha nằm ngoài nhánh này.',
          );
        else setError(adminError(reason));
      },
    };
    if (editing) update.mutate({ ...input, id: editing.id }, callbacks);
    else create.mutate(input, callbacks);
  }

  function beginEdit(category: CategoryNode): void {
    setEditing(category);
    setName(category.name);
    setParentId(category.parentId ?? '');
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function deleteItem(category: CategoryNode): void {
    // Both blockers are visible in the row, so refusing here explains the rule
    // without spending a request that the server would answer with a 409.
    const blockers: string[] = [];
    if (category.children.length) blockers.push(`${category.children.length} danh mục con`);
    if (category.productCount) blockers.push(`${category.productCount} sản phẩm`);
    if (blockers.length) {
      setError(
        `Không thể xóa “${category.name}”: danh mục còn ${blockers.join(' và ')}. Hãy chuyển chúng sang danh mục khác (hoặc xóa) trước.`,
      );
      return;
    }
    if (!window.confirm(`Xóa danh mục “${category.name}”?`)) return;
    setError(null);
    remove.mutate(category.id, {
      onError: (reason) => {
        if (adminErrorStatus(reason) !== 409) {
          setError(adminError(reason));
          return;
        }
        const message = adminError(reason);
        // productCount only counts published products, so a category that looks
        // empty here can still hold unpublished ones. The server says which.
        setError(
          message.includes('subcategor')
            ? `Không thể xóa “${category.name}”: danh mục vẫn còn danh mục con. Hãy chuyển hoặc xóa các danh mục con trước.`
            : `Không thể xóa “${category.name}”: danh mục vẫn còn sản phẩm, kể cả sản phẩm chưa xuất bản (những sản phẩm này không được tính trong số hiển thị ở đây). Hãy chuyển chúng sang danh mục khác trước.`,
        );
      },
    });
  }

  return (
    <AdminShell>
      <PageHeader
        title="Danh mục"
        description="Nhóm sản phẩm theo danh mục, có thể lồng nhiều cấp. Số sản phẩm hiển thị là sản phẩm đã xuất bản nằm trực tiếp trong danh mục, không gồm danh mục con."
        action={rows.length > 0 && <Badge tone="slate">{rows.length} danh mục</Badge>}
      />

      <Panel
        title={editing ? `Sửa: ${editing.name}` : 'Thêm danh mục mới'}
        icon={editing ? Pencil : Plus}
        action={
          editing && (
            <button className="btn-ghost btn-sm" type="button" onClick={reset}>
              <X className="h-4 w-4" aria-hidden />
              Huỷ
            </button>
          )
        }
      >
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="category-name">
                Tên danh mục
              </label>
              <input
                className="field"
                id="category-name"
                placeholder="Thời trang nam"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              {name.trim() && (
                <p className="mt-1.5 text-xs text-slate-400">
                  Slug: <code className="font-mono text-slate-500">{slugify(name)}</code>
                </p>
              )}
            </div>
            <div>
              <label className="label" htmlFor="category-parent">
                Danh mục cha
              </label>
              <select
                className="field"
                id="category-parent"
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
                <option value="">Không có (danh mục gốc)</option>
                {rows.map(({ category, depth }) => (
                  <option key={category.id} value={category.id} disabled={forbidden.has(category.id)}>
                    {`${'    '.repeat(depth)}${depth ? '↳ ' : ''}${category.name}`}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-slate-400">
                {editing
                  ? 'Chính danh mục này và các danh mục con của nó bị vô hiệu hoá: chuyển một danh mục vào nhánh con của chính nó sẽ tách cả nhánh khỏi gốc, nên máy chủ từ chối.'
                  : 'Để trống nếu đây là danh mục cấp cao nhất.'}
              </p>
            </div>
          </div>
          {error && <Alert>{error}</Alert>}
          <button className="btn-primary" disabled={create.isPending || update.isPending}>
            {editing ? 'Lưu thay đổi' : 'Tạo danh mục'}
          </button>
        </form>
      </Panel>

      <Panel className="mt-6" title="Cây danh mục" icon={Tags} bare>
        {categories.isPending ? (
          <div className="p-5">
            <Skeleton className="h-48" />
          </div>
        ) : categories.isError ? (
          <div className="p-5">
            <Alert>Không thể tải danh sách danh mục.</Alert>
          </div>
        ) : rows.length ? (
          <CategoryTree
            nodes={categories.data ?? []}
            editingId={editing?.id ?? null}
            busy={remove.isPending}
            onEdit={beginEdit}
            onDelete={deleteItem}
          />
        ) : (
          <p className="p-8 text-center text-sm text-slate-500">Chưa có danh mục nào.</p>
        )}
      </Panel>
    </AdminShell>
  );
}
