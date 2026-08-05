import { useQuery } from '@tanstack/react-query';
import { Barcode, ChevronRight, PackageX, ShoppingCart } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { ProductGallery } from '../components/ProductGallery';
import { ProductImage } from '../components/ProductImage';
import { ProductQuestions } from '../components/ProductQuestions';
import { ProductReviews } from '../components/ProductReviews';
import { StockAlertButton } from '../components/StockAlertButton';
import { Alert, Badge, EmptyState, Skeleton, Stars } from '../components/ui';
import { cartErrorMessage, useAddToCart } from '../lib/cart-api';
import { getProduct, getRelatedProducts } from '../lib/catalog-api';
import { formatPrice } from '../lib/format';
import { useAuthStore } from '../stores/auth-store';

export function ProductDetailPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isLoggedIn = useAuthStore((state) => Boolean(state.user && state.tokens));
  const addToCart = useAddToCart();
  const productQuery = useQuery({ queryKey: ['product', id], queryFn: () => getProduct(id) });
  const product = productQuery.data;
  // Suggestions are a bonus, so they only load once the product itself is
  // there; a 404 on the product must never turn into two failed requests.
  const relatedQuery = useQuery({
    queryKey: ['product', id, 'related'],
    queryFn: () => getRelatedProducts(id),
    enabled: Boolean(product),
  });
  const related = relatedQuery.data ?? [];

  const addProduct = (): void => {
    if (!isLoggedIn) {
      navigate('/login', { state: { from: location.pathname } });
      return;
    }
    addToCart.mutate({ productId: id, quantity: 1 });
  };

  return (
    <AppShell width="lg">
      {productQuery.isPending ? (
        <div className="grid gap-8 md:grid-cols-2">
          <Skeleton className="aspect-square w-full" />
          <div className="space-y-4">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-12 w-40" />
          </div>
        </div>
      ) : productQuery.isError ? (
        <Alert>Không thể tải sản phẩm. Vui lòng thử lại.</Alert>
      ) : !product ? (
        <EmptyState
          icon={PackageX}
          title="Không tìm thấy sản phẩm"
          description="Sản phẩm này không tồn tại, hoặc đã ngừng kinh doanh và không còn được bày bán. Nếu bạn vừa lưu đường dẫn, hãy tìm lại sản phẩm trong danh sách."
          action={
            <Link className="btn-primary" to="/products">
              Quay lại danh sách sản phẩm
            </Link>
          }
        />
      ) : (
        <>
          <nav className="mb-6 flex flex-wrap items-center gap-1 text-sm text-slate-500">
            <Link className="hover:text-slate-900" to="/products">
              Sản phẩm
            </Link>
            <ChevronRight className="h-4 w-4" aria-hidden />
            <Link
              className="hover:text-slate-900"
              to={`/products?categoryId=${encodeURIComponent(product.categoryId)}`}
            >
              {product.category.name}
            </Link>
            <ChevronRight className="h-4 w-4" aria-hidden />
            <span className="truncate font-medium text-slate-700">{product.name}</span>
          </nav>

          <article className="grid gap-8 md:grid-cols-2 lg:gap-12">
            {/* Falls back to the legacy single thumbnail when a product
                predates galleries, so nothing loses its picture. */}
            <ProductGallery
              images={product.images}
              imageUrl={product.imageUrl}
              name={product.name}
            />

            <div className="flex flex-col">
              <Badge tone="brand" className="self-start">
                {product.category.name}
              </Badge>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                {product.name}
              </h1>

              <div className="mt-3 flex items-center gap-2 text-sm">
                {product.reviewCount ? (
                  <>
                    <Stars rating={product.averageRating ?? 0} />
                    <span className="text-slate-600">
                      {(product.averageRating ?? 0).toFixed(1)} · {product.reviewCount} đánh giá
                    </span>
                  </>
                ) : (
                  <span className="text-slate-400">Chưa có đánh giá</span>
                )}
              </div>

              {product.sku && (
                <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-500">
                  <Barcode className="h-4 w-4 text-slate-400" aria-hidden />
                  Mã sản phẩm:{' '}
                  <span className="font-medium tracking-wide text-slate-700">{product.sku}</span>
                </p>
              )}

              <p className="mt-6 text-3xl font-bold tracking-tight text-slate-900">
                {formatPrice(product.price)}
              </p>

              <div className="mt-3">
                {product.stock > 0 ? (
                  <Badge tone="emerald">Còn {product.stock} sản phẩm</Badge>
                ) : (
                  <Badge tone="rose">Hết hàng</Badge>
                )}
              </div>

              <p className="mt-6 whitespace-pre-line leading-relaxed text-slate-600">
                {product.description}
              </p>

              <div className="mt-8 space-y-3">
                {addToCart.isSuccess && (
                  <Alert tone="success">
                    Đã thêm vào giỏ hàng.{' '}
                    <Link className="font-semibold underline underline-offset-2" to="/cart">
                      Xem giỏ hàng
                    </Link>
                  </Alert>
                )}
                {addToCart.isError && <Alert>{cartErrorMessage(addToCart.error)}</Alert>}
                {product.stock < 1 ? (
                  // A disabled "Hết hàng" button is a dead end. Waiting for
                  // restock is the one thing the customer can still do here.
                  <StockAlertButton productId={product.id} />
                ) : (
                  <button
                    className="btn-primary btn-lg w-full sm:w-auto"
                    disabled={addToCart.isPending}
                    onClick={addProduct}
                  >
                    <ShoppingCart className="h-5 w-5" aria-hidden />
                    Thêm vào giỏ hàng
                  </button>
                )}
              </div>
            </div>
          </article>

          {(relatedQuery.isLoading || related.length > 0) && (
            <section className="mt-14 border-t border-slate-200 pt-10">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                    Sản phẩm liên quan
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Cùng danh mục {product.category.name}, còn hàng và được đánh giá cao nhất.
                  </p>
                </div>
                <Link
                  className="btn-secondary btn-sm"
                  to={`/products?categoryId=${encodeURIComponent(product.categoryId)}`}
                >
                  Xem cả danh mục
                </Link>
              </div>

              {relatedQuery.isLoading ? (
                <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {Array.from({ length: 4 }, (_, index) => (
                    <Skeleton className="h-56" key={index} />
                  ))}
                </div>
              ) : (
                <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {related.map((item) => (
                    <li key={item.id}>
                      <Link
                        className="group card block h-full overflow-hidden transition duration-200 hover:-translate-y-1 hover:shadow-card-hover"
                        to={`/products/${item.id}`}
                      >
                        <ProductImage
                          imageUrl={item.imageUrl}
                          name={item.name}
                          className="aspect-[4/3] w-full transition duration-300 group-hover:scale-105"
                        />
                        <div className="p-3">
                          <h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-snug text-slate-900 group-hover:text-brand-700">
                            {item.name}
                          </h3>
                          <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                            {item.reviewCount ? (
                              <>
                                <Stars rating={item.averageRating ?? 0} size="sm" />
                                <span className="text-slate-500">({item.reviewCount})</span>
                              </>
                            ) : (
                              <span className="text-slate-400">Chưa có đánh giá</span>
                            )}
                          </div>
                          <p className="mt-2 font-bold text-slate-900">{formatPrice(item.price)}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <ProductReviews productId={product.id} />
          <ProductQuestions productId={product.id} />
        </>
      )}
    </AppShell>
  );
}
