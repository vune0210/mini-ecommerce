import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Tags, Trash2, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { AdminShell } from '../components/AdminShell';
import { Alert, Badge, PageHeader, Panel, Skeleton } from '../components/ui';
import { adminError, useCreateCategory, useDeleteCategory, useUpdateCategory } from '../lib/admin-api';
import { getCategories } from '../lib/catalog-api';
import { slugify } from '../lib/format';
import type { Category } from '../types/catalog';

export function AdminCategoriesPage() {
  const categories = useQuery({ queryKey: ['categories'], queryFn: getCategories });
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset(): void {
    setEditing(null);
    setName('');
    setError(null);
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (!name.trim()) {
      setError('Tên danh mục là bắt buộc.');
      return;
    }
    setError(null);
    const input = { name: name.trim(), slug: slugify(name) };
    const callbacks = {
      onSuccess: () => {
        setName('');
        setEditing(null);
      },
      onError: (reason: unknown) => setError(adminError(reason)),
    };
    if (editing) update.mutate({ ...input, id: editing.id }, callbacks);
    else create.mutate(input, callbacks);
  }

  function beginEdit(category: Category): void {
    setEditing(category);
    setName(category.name);
    setError(null);
  }

  function deleteItem(category: Category): void {
    if (
      !window.confirm(
        `Xóa danh mục “${category.name}”? Danh mục có sản phẩm có thể bị backend từ chối.`,
      )
    )
      return;
    remove.mutate(category.id, { onError: (reason) => setError(adminError(reason)) });
  }

  return (
    <AdminShell>
      <PageHeader
        title="Danh mục"
        description="Nhóm sản phẩm theo danh mục để khách dễ tìm."
        action={categories.data && <Badge tone="slate">{categories.data.length} danh mục</Badge>}
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
          <div>
            <label className="label" htmlFor="category-name">
              Tên danh mục
            </label>
            <div className="flex flex-wrap gap-3">
              <input
                className="field flex-1"
                id="category-name"
                placeholder="Thời trang nam"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <button className="btn-primary" disabled={create.isPending || update.isPending}>
                {editing ? 'Lưu thay đổi' : 'Tạo danh mục'}
              </button>
            </div>
            {name.trim() && (
              <p className="mt-1.5 text-xs text-slate-400">
                Slug: <code className="font-mono text-slate-500">{slugify(name)}</code>
              </p>
            )}
          </div>
          {error && <Alert>{error}</Alert>}
        </form>
      </Panel>

      <Panel className="mt-6" title="Danh sách danh mục" icon={Tags} bare>
        {categories.isPending ? (
          <div className="p-5">
            <Skeleton className="h-48" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3 font-semibold">Tên</th>
                  <th className="px-5 py-3 font-semibold">Slug</th>
                  <th className="px-5 py-3 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {categories.data?.map((category) => (
                  <tr className="transition-colors hover:bg-slate-50/60" key={category.id}>
                    <td className="px-5 py-3 font-medium text-slate-900">{category.name}</td>
                    <td className="px-5 py-3">
                      <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-500">
                        {category.slug}
                      </code>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
                          onClick={() => beginEdit(category)}
                          aria-label={`Sửa ${category.name}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          disabled={remove.isPending}
                          onClick={() => deleteItem(category)}
                          aria-label={`Xóa ${category.name}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!categories.data?.length && (
              <p className="p-8 text-center text-sm text-slate-500">Chưa có danh mục nào.</p>
            )}
          </div>
        )}
      </Panel>
    </AdminShell>
  );
}
