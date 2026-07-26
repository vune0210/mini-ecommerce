import { useQuery } from '@tanstack/react-query';
import { PackageSearch, Search, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { ProductImage } from '../components/ProductImage';
import { Alert, Badge, EmptyState, Pagination, Skeleton, Stars } from '../components/ui';
import { getCategories, getProducts } from '../lib/catalog-api';
import { formatPrice } from '../lib/format';
import type { ProductSort } from '../types/catalog';

const PAGE_SIZE = 12;

const sortOptions: Array<{ value: ProductSort; label: string }> = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'price_asc', label: 'Giá tăng dần' },
  { value: 'price_desc', label: 'Giá giảm dần' },
  { value: 'rating_desc', label: 'Đánh giá cao nhất' },
];

export function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const categoryId = searchParams.get('categoryId') ?? '';
  const pageValue = Number(searchParams.get('page') ?? '1');
  const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const sort = (searchParams.get('sort') ?? 'newest') as ProductSort;
  const minPrice = searchParams.get('minPrice') ?? '';
  const maxPrice = searchParams.get('maxPrice') ?? '';
  const [searchInput, setSearchInput] = useState(search);

  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: getCategories });
  const productsQuery = useQuery({
    queryKey: ['products', { search, categoryId, sort, minPrice, maxPrice, page, limit: PAGE_SIZE }],
    queryFn: () => getProducts({ search, categoryId, sort, minPrice, maxPrice, page, limit: PAGE_SIZE }),
  });

  useEffect(() => setSearchInput(search), [search]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput === search) return;
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        if (searchInput.trim()) next.set('search', searchInput.trim());
        else next.delete('search');
        next.delete('page');
        return next;
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search, searchInput, setSearchParams]);

  function setFilter(key: 'categoryId' | 'sort' | 'minPrice' | 'maxPrice', value: string): void {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value && !(key === 'sort' && value === 'newest')) next.set(key, value);
      else next.delete(key);
      next.delete('page');
      return next;
    });
  }

  function setPage(nextPage: number): void {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (nextPage === 1) next.delete('page');
      else next.set('page', String(nextPage));
      return next;
    });
  }

  function resetFilters(): void {
    setSearchInput('');
    setSearchParams(new URLSearchParams());
  }

  const data = productsQuery.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const hasFilters = Boolean(search || categoryId || minPrice || maxPrice || sort !== 'newest');

  return (
    <AppShell bleed>
      <section className="border-b border-slate-200 bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-inset ring-white/25">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Hàng mới về mỗi tuần
          </span>
          <h1 className="mt-5 max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Mua sắm dễ dàng hơn
          </h1>
          <p className="mt-4 max-w-xl text-base text-brand-100 sm:text-lg">
            Khám phá bộ sưu tập sản phẩm được tuyển chọn, giá tốt và giao hàng nhanh trên toàn quốc.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        <div className="card p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-12">
            <div className="relative lg:col-span-5">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                className="field pl-10"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Tìm kiếm sản phẩm..."
                aria-label="Tìm kiếm sản phẩm"
              />
            </div>
            <select
              className="field lg:col-span-3"
              value={categoryId}
              onChange={(event) => setFilter('categoryId', event.target.value)}
              aria-label="Lọc theo danh mục"
            >
              <option value="">Tất cả danh mục</option>
              {categoriesQuery.data?.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <select
              className="field lg:col-span-4"
              value={sort}
              onChange={(event) => setFilter('sort', event.target.value)}
              aria-label="Sắp xếp"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-500">Khoảng giá</span>
            <div className="flex flex-1 items-center gap-3 sm:flex-none">
              <input
                className="field w-full sm:w-32"
                type="number"
                min="0"
                step="0.01"
                value={minPrice}
                onChange={(event) => setFilter('minPrice', event.target.value)}
                placeholder="Từ"
                aria-label="Giá thấp nhất"
              />
              <span className="text-slate-400">—</span>
              <input
                className="field w-full sm:w-32"
                type="number"
                min="0"
                step="0.01"
                value={maxPrice}
                onChange={(event) => setFilter('maxPrice', event.target.value)}
                placeholder="Đến"
                aria-label="Giá cao nhất"
              />
            </div>
            {hasFilters && (
              <button className="btn-ghost btn-sm ml-auto" onClick={resetFilters}>
                Xoá bộ lọc
              </button>
            )}
          </div>
        </div>

        {data && (
          <p className="mt-6 text-sm text-slate-500">
            <span className="font-semibold text-slate-900">{data.total}</span> sản phẩm
            {search && (
              <>
                {' '}
                cho “<span className="font-medium text-slate-700">{search}</span>”
              </>
            )}
          </p>
        )}

        {productsQuery.isPending ? (
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton className="h-80" key={index} />
            ))}
          </div>
        ) : productsQuery.isError ? (
          <Alert className="mt-4">Không thể tải sản phẩm. Vui lòng thử lại.</Alert>
        ) : !data?.items.length ? (
          <div className="mt-4">
            <EmptyState
              icon={PackageSearch}
              title="Không tìm thấy sản phẩm nào"
              description="Thử đổi từ khoá hoặc bỏ bớt bộ lọc để xem thêm kết quả."
              action={
                hasFilters ? (
                  <button className="btn-primary" onClick={resetFilters}>
                    Xoá bộ lọc
                  </button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((product) => (
                <Link
                  className="group card animate-fade-up overflow-hidden transition duration-200 hover:-translate-y-1 hover:shadow-card-hover"
                  to={`/products/${product.id}`}
                  key={product.id}
                >
                  <div className="relative overflow-hidden">
                    <ProductImage
                      imageUrl={product.imageUrl}
                      name={product.name}
                      className="aspect-[4/3] w-full transition duration-300 group-hover:scale-105"
                    />
                    <span className="absolute left-3 top-3">
                      <Badge tone="brand" className="bg-white/90 backdrop-blur">
                        {product.category.name}
                      </Badge>
                    </span>
                    {product.stock === 0 && (
                      <span className="absolute inset-0 grid place-items-center bg-white/70 backdrop-blur-[1px]">
                        <Badge tone="rose">Hết hàng</Badge>
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <h2 className="line-clamp-2 min-h-11 font-semibold leading-snug text-slate-900 group-hover:text-brand-700">
                      {product.name}
                    </h2>
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      {product.reviewCount ? (
                        <>
                          <Stars rating={product.averageRating ?? 0} size="sm" />
                          <span className="text-slate-500">
                            {(product.averageRating ?? 0).toFixed(1)} ({product.reviewCount})
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-400">Chưa có đánh giá</span>
                      )}
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-2">
                      <p className="text-lg font-bold text-slate-900">{formatPrice(product.price)}</p>
                      {product.stock > 0 && (
                        <p className="text-xs font-medium text-emerald-600">Còn {product.stock}</p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
              summary={`Hiển thị ${data.items.length} / ${data.total} sản phẩm`}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
