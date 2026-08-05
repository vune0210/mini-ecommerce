import { useQuery } from '@tanstack/react-query';
import { FolderTree, ListFilter, PackageSearch, Sparkles, Star, Tags } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SearchSuggest } from '../components/SearchSuggest';
import { TagFilter } from '../components/TagFilter';
import { AppShell } from '../components/AppShell';
import { ProductImage } from '../components/ProductImage';
import {
  Alert,
  Badge,
  EmptyState,
  Pagination,
  Panel,
  Skeleton,
  SkeletonList,
  Stars,
} from '../components/ui';
import { getCategoryTree, getProducts } from '../lib/catalog-api';
import { formatPrice } from '../lib/format';
import type { CategoryNode, ProductSort } from '../types/catalog';

const PAGE_SIZE = 12;

const sortOptions: Array<{ value: ProductSort; label: string }> = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'price_asc', label: 'Giá tăng dần' },
  { value: 'price_desc', label: 'Giá giảm dần' },
  { value: 'rating_desc', label: 'Đánh giá cao nhất' },
  { value: 'name_asc', label: 'Tên A → Z' },
];

const ratingOptions = [5, 4, 3, 2];

/** Depth-first lookup — the tree is a handful of rows, never a hot path. */
function findCategory(nodes: CategoryNode[], id: string): CategoryNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findCategory(node.children, id);
    if (found) return found;
  }
  return null;
}

/** productCount counts a category alone, so the branch total is summed here. */
function subtreeProductCount(node: CategoryNode): number {
  return (
    (node.productCount ?? 0) +
    node.children.reduce((total, child) => total + subtreeProductCount(child), 0)
  );
}

function subtreeSize(node: CategoryNode): number {
  return node.children.reduce((total, child) => total + 1 + subtreeSize(child), 0);
}

type CategoryTreeProps = {
  nodes: CategoryNode[];
  selectedId: string;
  onSelect: (node: CategoryNode) => void;
  depth?: number;
};

function CategoryTree({ nodes, selectedId, onSelect, depth = 0 }: CategoryTreeProps) {
  return (
    <ul className={depth ? 'mt-1 space-y-1 border-l border-slate-200 pl-3' : 'space-y-1'}>
      {nodes.map((node) => (
        <li key={node.id}>
          <button
            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
              selectedId === node.id
                ? 'bg-brand-50 font-semibold text-brand-700 ring-1 ring-inset ring-brand-200'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
            type="button"
            onClick={() => onSelect(node)}
            aria-pressed={selectedId === node.id}
          >
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
            <span className="shrink-0 tabular-nums text-xs text-slate-400">
              {node.productCount ?? 0}
            </span>
          </button>
          {node.children.length > 0 && (
            <CategoryTree
              nodes={node.children}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

export function ProductListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const categoryId = searchParams.get('categoryId') ?? '';
  const includeDescendants = searchParams.get('includeDescendants') === 'true';
  const pageValue = Number(searchParams.get('page') ?? '1');
  const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const sort = (searchParams.get('sort') ?? 'newest') as ProductSort;
  const minPrice = searchParams.get('minPrice') ?? '';
  const maxPrice = searchParams.get('maxPrice') ?? '';
  const inStock = searchParams.get('inStock') === 'true';
  const ratingValue = Number(searchParams.get('minRating') ?? '');
  const minRating =
    Number.isInteger(ratingValue) && ratingValue >= 1 && ratingValue <= 5 ? ratingValue : undefined;
  // Comma-joined in the URL so a filtered catalogue stays linkable.
  const tags = (searchParams.get('tags') ?? '')
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean);
  const tagsKey = tags.join(',');
  const [searchInput, setSearchInput] = useState(search);

  const categoriesQuery = useQuery({ queryKey: ['categories', 'tree'], queryFn: getCategoryTree });
  const productsQuery = useQuery({
    queryKey: [
      'products',
      {
        search,
        categoryId,
        includeDescendants,
        sort,
        minPrice,
        maxPrice,
        inStock,
        minRating,
        tags: tagsKey,
        page,
        limit: PAGE_SIZE,
      },
    ],
    queryFn: () =>
      getProducts({
        search,
        categoryId,
        includeDescendants,
        sort,
        minPrice,
        maxPrice,
        inStock,
        minRating,
        tags,
        page,
        limit: PAGE_SIZE,
      }),
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

  /** Every filter change drops the page back to 1; a page 5 that no longer exists is a dead end. */
  function setFilters(patch: Record<string, string | null>): void {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
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

  /**
   * Choosing a parent means "this part of the catalogue", so the subtree comes
   * along by default — but the checkbox below spells that out and lets it be
   * switched off, rather than the URL quietly widening the search.
   */
  function selectCategory(node: CategoryNode | null): void {
    if (!node) {
      setFilters({ categoryId: null, includeDescendants: null });
      return;
    }
    setFilters({
      categoryId: node.id,
      includeDescendants: node.children.length ? 'true' : null,
    });
  }

  const data = productsQuery.data;
  const categories = categoriesQuery.data ?? [];
  const selectedCategory = categoryId ? findCategory(categories, categoryId) : null;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const hasFilters = Boolean(
    search ||
      categoryId ||
      minPrice ||
      maxPrice ||
      inStock ||
      minRating ||
      tags.length ||
      sort !== 'newest',
  );

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
            <div className="lg:col-span-8">
              {/* Enter falls through to the existing debounced URL search, so
                  "show me everything matching this" still works; picking a
                  suggestion is the shortcut for "I meant that one". */}
              <SearchSuggest
                value={searchInput}
                onChange={setSearchInput}
                onSubmit={() => setFilters({ search: searchInput.trim() || null })}
              />
            </div>
            <select
              className="field lg:col-span-4"
              value={sort}
              onChange={(event) =>
                setFilters({ sort: event.target.value === 'newest' ? null : event.target.value })
              }
              aria-label="Sắp xếp"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
          <aside className="space-y-4">
            <Panel title="Danh mục" icon={FolderTree}>
              {categoriesQuery.isPending ? (
                <SkeletonList count={5} className="h-8" />
              ) : categoriesQuery.isError ? (
                <p className="text-sm text-slate-500">Không thể tải danh mục.</p>
              ) : (
                <>
                  <button
                    className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                      categoryId
                        ? 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        : 'bg-brand-50 font-semibold text-brand-700 ring-1 ring-inset ring-brand-200'
                    }`}
                    type="button"
                    onClick={() => selectCategory(null)}
                    aria-pressed={!categoryId}
                  >
                    Tất cả danh mục
                  </button>
                  <div className="mt-1 max-h-80 overflow-y-auto">
                    <CategoryTree
                      nodes={categories}
                      selectedId={categoryId}
                      onSelect={selectCategory}
                    />
                  </div>
                  <p className="mt-2 px-2.5 text-xs text-slate-400">
                    Số bên phải là sản phẩm thuộc riêng danh mục đó.
                  </p>
                  {selectedCategory && selectedCategory.children.length > 0 && (
                    <label className="mt-3 flex items-start gap-2 rounded-xl bg-brand-50/70 p-3 text-xs leading-relaxed text-brand-900 ring-1 ring-inset ring-brand-100">
                      <input
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        type="checkbox"
                        checked={includeDescendants}
                        onChange={(event) =>
                          setFilters({ includeDescendants: event.target.checked ? 'true' : null })
                        }
                      />
                      <span>
                        Gồm cả {subtreeSize(selectedCategory)} danh mục con của “
                        {selectedCategory.name}”.{' '}
                        {includeDescendants
                          ? `Đang tìm trong cả nhánh (${subtreeProductCount(selectedCategory)} sản phẩm).`
                          : `Đang chỉ tìm trong danh mục này (${selectedCategory.productCount ?? 0} sản phẩm).`}
                      </span>
                    </label>
                  )}
                </>
              )}
            </Panel>

            <Panel title="Thẻ" icon={Tags}>
              <TagFilter
                selected={tags}
                onChange={(slugs) =>
                  setFilters({ tags: slugs.length ? slugs.join(',') : null })
                }
              />
            </Panel>

            <Panel title="Bộ lọc" icon={ListFilter}>
              <div>
                <span className="label">Đánh giá</span>
                <div className="flex flex-wrap gap-2">
                  {ratingOptions.map((value) => (
                    <button
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition-colors ${
                        minRating === value
                          ? 'bg-amber-50 text-amber-700 ring-amber-300'
                          : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                      }`}
                      type="button"
                      key={value}
                      onClick={() =>
                        setFilters({ minRating: minRating === value ? null : String(value) })
                      }
                      aria-pressed={minRating === value}
                      aria-label={`Từ ${value} sao trở lên`}
                    >
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
                      {value === 5 ? '5 sao' : `${value}+`}
                    </button>
                  ))}
                </div>
                {minRating !== undefined && (
                  <p className="mt-2 text-xs text-slate-400">
                    Sản phẩm chưa có đánh giá sẽ không xuất hiện khi lọc theo sao.
                  </p>
                )}
              </div>

              <label className="mt-4 flex items-center gap-2 text-sm text-slate-600">
                <input
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  type="checkbox"
                  checked={inStock}
                  onChange={(event) => setFilters({ inStock: event.target.checked ? 'true' : null })}
                />
                Chỉ sản phẩm còn hàng
              </label>

              <div className="mt-4">
                <span className="label">Khoảng giá</span>
                <div className="flex items-center gap-2">
                  <input
                    className="field"
                    type="number"
                    min="0"
                    step="0.01"
                    value={minPrice}
                    onChange={(event) => setFilters({ minPrice: event.target.value })}
                    placeholder="Từ"
                    aria-label="Giá thấp nhất"
                  />
                  <span className="text-slate-400">—</span>
                  <input
                    className="field"
                    type="number"
                    min="0"
                    step="0.01"
                    value={maxPrice}
                    onChange={(event) => setFilters({ maxPrice: event.target.value })}
                    placeholder="Đến"
                    aria-label="Giá cao nhất"
                  />
                </div>
              </div>

              {hasFilters && (
                <button className="btn-secondary btn-sm mt-4 w-full" onClick={resetFilters}>
                  Xoá bộ lọc
                </button>
              )}
            </Panel>
          </aside>

          <div>
            {data && (
              <p className="text-sm text-slate-500">
                <span className="font-semibold text-slate-900">{data.total}</span> sản phẩm
                {search && (
                  <>
                    {' '}
                    cho “<span className="font-medium text-slate-700">{search}</span>”
                  </>
                )}
                {selectedCategory && (
                  <>
                    {' '}
                    trong{' '}
                    <span className="font-medium text-slate-700">{selectedCategory.name}</span>
                    {includeDescendants && ' và các danh mục con'}
                  </>
                )}
              </p>
            )}

            {productsQuery.isPending ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
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
                <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
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
                          <p className="text-lg font-bold text-slate-900">
                            {formatPrice(product.price)}
                          </p>
                          {product.stock > 0 && (
                            <p className="text-xs font-medium text-emerald-600">
                              Còn {product.stock}
                            </p>
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
        </div>
      </div>
    </AppShell>
  );
}
