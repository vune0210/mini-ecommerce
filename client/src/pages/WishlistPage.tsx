import { ArrowRight, Heart, Loader2, ShoppingCart, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { ProductImage } from '../components/ProductImage';
import { Alert, Badge, EmptyState, PageHeader, Skeleton, Stars } from '../components/ui';
import { formatDate, formatPrice } from '../lib/format';
import {
  useMoveWishlistToCart,
  useRemoveFromWishlist,
  useWishlist,
  wishlistErrorMessage,
} from '../lib/wishlist-api';

export function WishlistPage() {
  const wishlistQuery = useWishlist();
  const moveToCart = useMoveWishlistToCart();
  const removeItem = useRemoveFromWishlist();

  const entries = wishlistQuery.data;
  const error = moveToCart.error ?? removeItem.error;
  // React Query keeps the in-flight variables, so only the card being worked on
  // shows a spinner instead of the whole grid freezing.
  const movingId = moveToCart.isPending ? moveToCart.variables?.productId : undefined;
  const removingId = removeItem.isPending ? removeItem.variables : undefined;

  return (
    <AppShell width="xl">
      <PageHeader
        title="Sản phẩm yêu thích"
        description={
          entries?.length ? `${entries.length} sản phẩm đang được lưu.` : undefined
        }
      />

      {wishlistQuery.isPending ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton className="h-96" key={index} />
          ))}
        </div>
      ) : wishlistQuery.isError ? (
        <Alert>Không thể tải danh sách yêu thích. Vui lòng thử lại.</Alert>
      ) : !entries?.length ? (
        <EmptyState
          icon={Heart}
          title="Chưa có sản phẩm yêu thích"
          description="Nhấn vào biểu tượng trái tim trên sản phẩm để lưu lại và xem sau."
          action={
            <Link className="btn-primary" to="/products">
              Khám phá cửa hàng
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {moveToCart.isSuccess && (
            <Alert tone="success">
              Đã chuyển sản phẩm vào giỏ hàng.{' '}
              <Link className="font-semibold underline underline-offset-2" to="/cart">
                Xem giỏ hàng
              </Link>
            </Alert>
          )}
          {error && <Alert>{wishlistErrorMessage(error)}</Alert>}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((entry) => {
              const { product } = entry;
              const isMoving = movingId === product.id;
              const isRemoving = removingId === product.id;
              return (
                <article className="card flex flex-col overflow-hidden" key={entry.id}>
                  <Link className="group relative overflow-hidden" to={`/products/${product.id}`}>
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
                    {/* Sold-out entries stay on the list — only the cart button goes. */}
                    {!entry.inStock && (
                      <span className="absolute inset-0 grid place-items-center bg-white/70 backdrop-blur-[1px]">
                        <Badge tone="rose">Hết hàng</Badge>
                      </span>
                    )}
                  </Link>

                  <div className="flex flex-1 flex-col p-4">
                    <Link
                      className="line-clamp-2 min-h-11 font-semibold leading-snug text-slate-900 hover:text-brand-700"
                      to={`/products/${product.id}`}
                    >
                      {product.name}
                    </Link>

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
                      {entry.inStock ? (
                        <p className="text-xs font-medium text-emerald-600">Còn {product.stock}</p>
                      ) : (
                        <p className="text-xs font-medium text-rose-600">Hết hàng</p>
                      )}
                    </div>

                    <p className="mt-2 text-xs text-slate-400">
                      Đã lưu ngày {formatDate(entry.createdAt)}
                    </p>

                    <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4">
                      <button
                        className="btn-primary btn-sm flex-1"
                        disabled={!entry.inStock || isMoving || isRemoving}
                        onClick={() => moveToCart.mutate({ productId: product.id, quantity: 1 })}
                        aria-label={`Chuyển ${product.name} vào giỏ hàng`}
                      >
                        {isMoving ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <ShoppingCart className="h-4 w-4" aria-hidden />
                        )}
                        {entry.inStock ? 'Thêm vào giỏ' : 'Hết hàng'}
                      </button>
                      <button
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        disabled={isMoving || isRemoving}
                        onClick={() => removeItem.mutate(product.id)}
                        aria-label={`Bỏ ${product.name} khỏi danh sách yêu thích`}
                      >
                        {isRemoving ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="h-4 w-4" aria-hidden />
                        )}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </AppShell>
  );
}
