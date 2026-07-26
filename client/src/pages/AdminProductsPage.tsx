import { useQuery } from '@tanstack/react-query';
import { Package, Pencil, Plus, Trash2, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { AdminShell } from '../components/AdminShell';
import { ProductImage } from '../components/ProductImage';
import { Alert, Badge, PageHeader, Panel, Skeleton } from '../components/ui';
import { adminError, useCreateProduct, useDeleteProduct, useUpdateProduct } from '../lib/admin-api';
import { getCategories, getProducts } from '../lib/catalog-api';
import { formatPrice, slugify } from '../lib/format';
import type { Product } from '../types/catalog';

const blank = { name: '', description: '', price: '', stock: '0', imageUrl: '', categoryId: '' };

export function AdminProductsPage() {
  const products = useQuery({
    queryKey: ['products', { admin: true }],
    queryFn: () => getProducts({ search: '', categoryId: '', page: 1, limit: 100 }),
  });
  const categories = useQuery({ queryKey: ['categories'], queryFn: getCategories });
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const remove = useDeleteProduct();
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set(field: keyof typeof blank, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function reset(): void {
    setEditing(null);
    setForm(blank);
    setError(null);
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    const price = Number(form.price);
    const stock = Number(form.stock);
    if (
      !form.name.trim() ||
      !form.description.trim() ||
      !form.categoryId ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      setError('Nhập tên, mô tả, danh mục, giá > 0 và tồn kho nguyên >= 0.');
      return;
    }
    setError(null);
    const input = {
      name: form.name.trim(),
      slug: editing?.slug ?? slugify(form.name),
      description: form.description.trim(),
      price,
      stock,
      categoryId: form.categoryId,
      ...(form.imageUrl.trim() ? { imageUrl: form.imageUrl.trim() } : {}),
    };
    const callbacks = {
      onSuccess: () => {
        setEditing(null);
        setForm(blank);
      },
      onError: (reason: unknown) => setError(adminError(reason)),
    };
    if (editing) update.mutate({ ...input, id: editing.id }, callbacks);
    else create.mutate(input, callbacks);
  }

  function edit(product: Product): void {
    setEditing(product);
    setForm({
      name: product.name,
      description: product.description,
      price: product.price,
      stock: String(product.stock),
      imageUrl: product.imageUrl ?? '',
      categoryId: product.categoryId,
    });
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function deleteItem(product: Product): void {
    if (!window.confirm(`Xóa sản phẩm “${product.name}”?`)) return;
    remove.mutate(product.id, { onError: (reason) => setError(adminError(reason)) });
  }

  return (
    <AdminShell>
      <PageHeader
        title="Sản phẩm"
        description="Tạo, chỉnh sửa và gỡ sản phẩm khỏi cửa hàng."
        action={products.data && <Badge tone="slate">{products.data.total} sản phẩm</Badge>}
      />

      <Panel
        title={editing ? `Sửa: ${editing.name}` : 'Thêm sản phẩm mới'}
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
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <div>
            <label className="label" htmlFor="product-name">
              Tên sản phẩm
            </label>
            <input
              className="field"
              id="product-name"
              placeholder="Áo thun cotton"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="product-category">
              Danh mục
            </label>
            <select
              className="field"
              id="product-category"
              value={form.categoryId}
              onChange={(event) => set('categoryId', event.target.value)}
            >
              <option value="">Chọn danh mục</option>
              {categories.data?.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="product-description">
              Mô tả
            </label>
            <textarea
              className="field"
              id="product-description"
              rows={3}
              placeholder="Mô tả chi tiết sản phẩm"
              value={form.description}
              onChange={(event) => set('description', event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="product-price">
              Giá (VND)
            </label>
            <input
              className="field"
              id="product-price"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="250000"
              value={form.price}
              onChange={(event) => set('price', event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="product-stock">
              Tồn kho
            </label>
            <input
              className="field"
              id="product-stock"
              type="number"
              min="0"
              step="1"
              value={form.stock}
              onChange={(event) => set('stock', event.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="product-image">
              Đường dẫn ảnh <span className="font-normal text-slate-400">(không bắt buộc)</span>
            </label>
            <input
              className="field"
              id="product-image"
              placeholder="https://..."
              value={form.imageUrl}
              onChange={(event) => set('imageUrl', event.target.value)}
            />
          </div>
          {error && (
            <div className="sm:col-span-2">
              <Alert>{error}</Alert>
            </div>
          )}
          <div className="sm:col-span-2">
            <button className="btn-primary" disabled={create.isPending || update.isPending}>
              {editing ? 'Lưu thay đổi' : 'Tạo sản phẩm'}
            </button>
          </div>
        </form>
      </Panel>

      <Panel className="mt-6" title="Danh sách sản phẩm" icon={Package} bare>
        {products.isPending ? (
          <div className="p-5">
            <Skeleton className="h-48" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3 font-semibold">Sản phẩm</th>
                  <th className="px-5 py-3 font-semibold">Danh mục</th>
                  <th className="px-5 py-3 text-right font-semibold">Giá</th>
                  <th className="px-5 py-3 text-center font-semibold">Kho</th>
                  <th className="px-5 py-3 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {products.data?.items.map((product) => (
                  <tr className="transition-colors hover:bg-slate-50/60" key={product.id}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <ProductImage
                          imageUrl={product.imageUrl}
                          name={product.name}
                          className="h-10 w-10 shrink-0 rounded-lg"
                        />
                        <span className="font-medium text-slate-900">{product.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{product.category.name}</td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-slate-900">
                      {formatPrice(product.price)}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <Badge
                        tone={product.stock === 0 ? 'rose' : product.stock <= 5 ? 'amber' : 'slate'}
                      >
                        {product.stock}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
                          onClick={() => edit(product)}
                          aria-label={`Sửa ${product.name}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          disabled={remove.isPending}
                          onClick={() => deleteItem(product)}
                          aria-label={`Xóa ${product.name}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!products.data?.items.length && (
              <p className="p-8 text-center text-sm text-slate-500">Chưa có sản phẩm nào.</p>
            )}
          </div>
        )}
      </Panel>
    </AdminShell>
  );
}
