import { Eye, EyeOff, Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { AdminShell } from '../components/AdminShell';
import { flattenCategories } from '../components/admin/CategoryTree';
import { ExportButton } from '../components/admin/ExportButton';
import { ProductImage } from '../components/ProductImage';
import { Alert, Badge, PageHeader, Pagination, Panel, Skeleton } from '../components/ui';
import {
  ADMIN_PRODUCT_PAGE_SIZE,
  adminError,
  adminErrorStatus,
  useAdminProducts,
  useCategoryTree,
  useCreateProduct,
  useDeleteProduct,
  useUpdateProduct,
} from '../lib/admin-api';
import { formatPrice, slugify } from '../lib/format';
import type { Product } from '../types/catalog';

const blank = {
  name: '',
  sku: '',
  description: '',
  price: '',
  stock: '0',
  imageUrl: '',
  categoryId: '',
  isActive: true,
};

type FormState = typeof blank;

export function AdminProductsPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [isActive, setIsActive] = useState<'' | 'true' | 'false'>('');
  const [inStock, setInStock] = useState(false);
  const [page, setPage] = useState(1);

  const products = useAdminProducts({ page, search, categoryId, isActive, inStock });
  const categories = useCategoryTree();
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const remove = useDeleteProduct();
  const [form, setForm] = useState<FormState>(blank);
  const [editing, setEditing] = useState<Product | null>(null);
  // The scope decides where the message renders: a failed save belongs beside
  // the form, a failed delete beside the row it came from.
  const [feedback, setFeedback] = useState<{ scope: 'form' | 'list'; message: string } | null>(null);
  // A product the server refused to delete: the offer to unpublish instead has
  // to name the product, not just repeat the error.
  const [blocked, setBlocked] = useState<Product | null>(null);

  const categoryOptions = flattenCategories(categories.data ?? []);
  /** Leading spaces collapse inside <option>; nbsp is the only reliable indent. */
  const optionLabel = (name: string, depth: number): string =>
    `${' '.repeat(depth * 4)}${depth ? '↳ ' : ''}${name}`;
  const totalPages = products.data
    ? Math.max(1, Math.ceil(products.data.total / ADMIN_PRODUCT_PAGE_SIZE))
    : 1;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput.trim() === search) return;
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search, searchInput]);

  function set<K extends keyof FormState>(field: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function reset(): void {
    setEditing(null);
    setForm(blank);
    setFeedback(null);
    setBlocked(null);
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
      setFeedback({ scope: 'form', message: 'Nhập tên, mô tả, danh mục, giá > 0 và tồn kho nguyên >= 0.' });
      return;
    }
    const sku = form.sku.trim().toUpperCase();
    if (sku && !/^[A-Z0-9][A-Z0-9._-]*$/.test(sku)) {
      setFeedback({ scope: 'form', message: 'SKU chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới, và bắt đầu bằng chữ hoặc số.' });
      return;
    }
    setFeedback(null);
    setBlocked(null);
    const input = {
      name: form.name.trim(),
      slug: editing?.slug ?? slugify(form.name),
      description: form.description.trim(),
      price,
      stock,
      categoryId: form.categoryId,
      isActive: form.isActive,
      ...(form.imageUrl.trim() ? { imageUrl: form.imageUrl.trim() } : {}),
    };
    const callbacks = {
      onSuccess: () => {
        setEditing(null);
        setForm(blank);
      },
      onError: (reason: unknown) =>
        setFeedback({ scope: 'form', message: adminError(reason) }),
    };
    // Clearing the box on an edit means "remove the SKU", which only an explicit
    // null expresses; on a create there is simply nothing to send.
    if (editing) update.mutate({ ...input, sku: sku || null, id: editing.id }, callbacks);
    else create.mutate({ ...input, ...(sku ? { sku } : {}) }, callbacks);
  }

  function edit(product: Product): void {
    setEditing(product);
    setForm({
      name: product.name,
      sku: product.sku ?? '',
      description: product.description,
      price: product.price,
      stock: String(product.stock),
      imageUrl: product.imageUrl ?? '',
      categoryId: product.categoryId,
      isActive: product.isActive,
    });
    setFeedback(null);
    setBlocked(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function togglePublish(product: Product): void {
    setFeedback(null);
    setBlocked(null);
    if (
      product.isActive &&
      !window.confirm(
        `Gỡ “${product.name}” khỏi cửa hàng? Sản phẩm sẽ biến mất khỏi danh sách, trang chi tiết trả về 404, và khách không thể thêm vào giỏ hay đặt hàng.`,
      )
    )
      return;
    update.mutate(
      { id: product.id, isActive: !product.isActive },
      { onError: (reason) => setFeedback({ scope: 'list', message: adminError(reason) }) },
    );
  }

  function deleteItem(product: Product): void {
    if (
      !window.confirm(
        `Xóa vĩnh viễn sản phẩm “${product.name}”? Nếu sản phẩm đã từng được đặt hàng, hãy gỡ khỏi cửa hàng thay vì xóa.`,
      )
    )
      return;
    setFeedback(null);
    setBlocked(null);
    remove.mutate(product.id, {
      onError: (reason) => {
        setFeedback({ scope: 'list', message: adminError(reason) });
        // 409: cart_items still references it. Deleting will never succeed while
        // that is true, so the only useful next step is unpublishing.
        if (adminErrorStatus(reason) === 409) setBlocked(product);
      },
    });
  }

  const busy = create.isPending || update.isPending || remove.isPending;

  return (
    <AdminShell>
      <PageHeader
        title="Sản phẩm"
        description="Toàn bộ catalogue, gồm cả sản phẩm chưa xuất bản. Gỡ khỏi cửa hàng là cách thay thế cho việc xóa một sản phẩm đã có lịch sử đơn hàng."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {products.data && <Badge tone="slate">{products.data.total} sản phẩm</Badge>}
            <ExportButton kind="products" label="Xuất CSV" />
          </div>
        }
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
              {categoryOptions.map(({ category, depth }) => (
                <option key={category.id} value={category.id}>
                  {optionLabel(category.name, depth)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="product-sku">
              SKU <span className="font-normal text-slate-400">(không bắt buộc)</span>
            </label>
            <input
              className="field font-mono uppercase"
              id="product-sku"
              placeholder="TSH-BLK-M"
              value={form.sku}
              onChange={(event) => set('sku', event.target.value)}
            />
            <p className="mt-1.5 text-xs text-slate-400">
              Mã kho, không trùng nhau trên toàn catalogue. Tìm kiếm ở trên cũng khớp theo SKU. Xóa
              trống ô này khi sửa sẽ gỡ SKU khỏi sản phẩm.
            </p>
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
          <div>
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
          <div className="sm:col-span-2">
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <input
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => set('isActive', event.target.checked)}
              />
              <span className="text-sm">
                <span className="font-medium text-slate-900">Xuất bản lên cửa hàng</span>
                <span className="mt-1 block text-xs text-slate-500">
                  Khi bỏ chọn, sản phẩm bị ẩn khỏi mọi danh sách công khai, trang chi tiết trả về
                  404, đồng thời bị từ chối khi thêm vào giỏ và khi thanh toán. Đây là cách thay thế
                  cho việc xóa một sản phẩm đã có lịch sử đơn hàng.
                </span>
              </span>
            </label>
          </div>
          {feedback?.scope === 'form' && (
            <div className="sm:col-span-2">
              <Alert>{feedback.message}</Alert>
            </div>
          )}
          <div className="sm:col-span-2">
            <button className="btn-primary" disabled={create.isPending || update.isPending}>
              {editing ? 'Lưu thay đổi' : 'Tạo sản phẩm'}
            </button>
          </div>
        </form>
      </Panel>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            className="field pl-10"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Tìm tên, slug hoặc SKU..."
            aria-label="Tìm sản phẩm"
          />
        </div>
        <select
          className="field"
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
            setPage(1);
          }}
          aria-label="Lọc theo danh mục"
        >
          <option value="">Tất cả danh mục</option>
          {categoryOptions.map(({ category, depth }) => (
            <option key={category.id} value={category.id}>
              {optionLabel(category.name, depth)}
            </option>
          ))}
        </select>
        <select
          className="field"
          value={isActive}
          onChange={(event) => {
            setIsActive(event.target.value as '' | 'true' | 'false');
            setPage(1);
          }}
          aria-label="Lọc theo trạng thái xuất bản"
        >
          <option value="">Xuất bản và chưa xuất bản</option>
          <option value="true">Đang bán</option>
          <option value="false">Chưa xuất bản</option>
        </select>
        <label className="flex items-center gap-2.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-700 shadow-sm">
          <input
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            type="checkbox"
            checked={inStock}
            onChange={(event) => {
              setInStock(event.target.checked);
              setPage(1);
            }}
          />
          Chỉ sản phẩm còn hàng
        </label>
      </div>

      {feedback?.scope === 'list' && (
        <div className="mt-6">
          <Alert>
            <p>{feedback.message}</p>
            {blocked && (
              <>
                <p className="mt-1.5 text-xs">
                  Sản phẩm vẫn nằm trong giỏ hàng của ai đó nên không thể xóa. Gỡ khỏi cửa hàng sẽ
                  ẩn nó khỏi danh sách, trả 404 ở trang chi tiết và chặn cả thêm vào giỏ lẫn thanh
                  toán — đó là cách thay thế cho việc xóa.
                </p>
                <button
                  className="btn-secondary btn-sm mt-3"
                  type="button"
                  disabled={busy}
                  onClick={() => togglePublish(blocked)}
                >
                  <EyeOff className="h-3.5 w-3.5" aria-hidden />
                  Gỡ “{blocked.name}” khỏi cửa hàng thay vì xóa
                </button>
              </>
            )}
          </Alert>
        </div>
      )}

      <Panel className="mt-6" title="Danh sách sản phẩm" icon={Package} bare>
        {products.isPending ? (
          <div className="p-5">
            <Skeleton className="h-48" />
          </div>
        ) : products.isError ? (
          <div className="p-5">
            <Alert>Không thể tải danh sách sản phẩm.</Alert>
          </div>
        ) : (
          <div className={`overflow-x-auto transition-opacity ${products.isFetching ? 'opacity-60' : ''}`}>
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3 font-semibold">Sản phẩm</th>
                  <th className="px-5 py-3 font-semibold">Danh mục</th>
                  <th className="px-5 py-3 text-right font-semibold">Giá</th>
                  <th className="px-5 py-3 text-center font-semibold">Kho</th>
                  <th className="px-5 py-3 text-center font-semibold">Trạng thái</th>
                  <th className="px-5 py-3 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {products.data?.items.map((product) => (
                  <tr
                    className={`transition-colors hover:bg-slate-50/60 ${
                      product.isActive ? '' : 'bg-slate-50/40'
                    }`}
                    key={product.id}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <ProductImage
                          imageUrl={product.imageUrl}
                          name={product.name}
                          className={`h-10 w-10 shrink-0 rounded-lg ${
                            product.isActive ? '' : 'opacity-50 grayscale'
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{product.name}</p>
                          <p className="font-mono text-xs text-slate-400">
                            {product.sku ?? 'Chưa có SKU'}
                          </p>
                        </div>
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
                    <td className="px-5 py-3 text-center">
                      <Badge tone={product.isActive ? 'emerald' : 'slate'}>
                        {product.isActive ? 'Đang bán' : 'Chưa xuất bản'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          className="btn-secondary btn-sm"
                          disabled={busy}
                          onClick={() => togglePublish(product)}
                          title={
                            product.isActive
                              ? 'Ẩn khỏi cửa hàng: không còn hiện trong danh sách, trang chi tiết trả về 404, không thêm được vào giỏ.'
                              : 'Đưa trở lại cửa hàng cho khách xem và mua.'
                          }
                        >
                          {product.isActive ? (
                            <>
                              <EyeOff className="h-3.5 w-3.5" aria-hidden />
                              Gỡ
                            </>
                          ) : (
                            <>
                              <Eye className="h-3.5 w-3.5" aria-hidden />
                              Xuất bản
                            </>
                          )}
                        </button>
                        <button
                          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
                          onClick={() => edit(product)}
                          aria-label={`Sửa ${product.name}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          disabled={busy}
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
              <p className="p-8 text-center text-sm text-slate-500">
                Không có sản phẩm nào khớp bộ lọc.
              </p>
            )}
          </div>
        )}
      </Panel>

      <Pagination
        page={page}
        totalPages={totalPages}
        onChange={setPage}
        summary={`${products.data?.total ?? 0} sản phẩm`}
      />
    </AdminShell>
  );
}
