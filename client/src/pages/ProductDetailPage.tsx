import { useQuery } from '@tanstack/react-query';
import { ChevronRight, PackageX, ShoppingCart } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { ProductImage } from '../components/ProductImage';
import { ProductReviews } from '../components/ProductReviews';
import { Alert, Badge, EmptyState, Skeleton, Stars } from '../components/ui';
import { cartErrorMessage, useAddToCart } from '../lib/cart-api';
import { getProduct } from '../lib/catalog-api';
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
          description="Sản phẩm có thể đã được gỡ khỏi cửa hàng."
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
            <div className="card overflow-hidden">
              <ProductImage
                imageUrl={product.imageUrl}
                name={product.name}
                className="aspect-square w-full"
              />
            </div>

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
                <button
                  className="btn-primary btn-lg w-full sm:w-auto"
                  disabled={addToCart.isPending || product.stock < 1}
                  onClick={addProduct}
                >
                  <ShoppingCart className="h-5 w-5" aria-hidden />
                  {product.stock < 1 ? 'Hết hàng' : 'Thêm vào giỏ hàng'}
                </button>
              </div>
            </div>
          </article>

          <ProductReviews productId={product.id} />
        </>
      )}
    </AppShell>
  );
}
