import { ArrowRight, Minus, Plus, ShoppingCart, Trash2, TriangleAlert } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { ProductImage } from '../components/ProductImage';
import { Alert, Badge, EmptyState, PageHeader, Skeleton } from '../components/ui';
import {
  blockedCartItems,
  cartErrorMessage,
  cartItemIssue,
  useCart,
  useRemoveCartItem,
  useUpdateCartItem,
} from '../lib/cart-api';
import { formatPrice } from '../lib/format';

export function CartPage() {
  const cartQuery = useCart();
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();
  const navigate = useNavigate();
  const cart = cartQuery.data;
  const error = updateItem.error ?? removeItem.error;
  // Checkout would 409 on these anyway; refusing here keeps the customer on the
  // one screen where the lines can actually be fixed.
  const blocked = blockedCartItems(cart);

  const changeQuantity = (itemId: string, quantity: number): void => {
    if (quantity >= 1) updateItem.mutate({ itemId, quantity });
  };

  return (
    <AppShell width="xl">
      <PageHeader
        title="Giỏ hàng"
        description={cart?.items.length ? `${cart.totalItems} sản phẩm đang chờ thanh toán.` : undefined}
      />

      {cartQuery.isPending ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-56" />
        </div>
      ) : cartQuery.isError ? (
        <Alert>Không thể tải giỏ hàng.</Alert>
      ) : !cart?.items.length ? (
        <EmptyState
          icon={ShoppingCart}
          title="Giỏ hàng trống"
          description="Bạn chưa thêm sản phẩm nào. Khám phá cửa hàng và chọn món bạn thích."
          action={
            <Link className="btn-primary" to="/products">
              Tiếp tục mua sắm
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          }
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            {error && <Alert>{cartErrorMessage(error)}</Alert>}

            {blocked.length > 0 && (
              <Alert tone="warning">
                <p className="font-semibold">
                  {blocked.length} sản phẩm trong giỏ không thể đặt hàng
                </p>
                <p className="mt-0.5">
                  Chúng tôi giữ nguyên các sản phẩm này thay vì tự động xoá. Hãy cập nhật số lượng
                  hoặc xoá khỏi giỏ để tiếp tục thanh toán.
                </p>
              </Alert>
            )}

            {cart.items.map((item) => {
              const issue = cartItemIssue(item);
              return (
                <article
                  className={`card grid gap-4 p-4 sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:items-center ${
                    issue ? 'border-amber-300 bg-amber-50/40' : ''
                  }`}
                  key={item.id}
                >
                  <Link to={`/products/${item.product.id}`}>
                    <ProductImage
                      imageUrl={item.product.imageUrl}
                      name={item.product.name}
                      className="h-24 w-24 rounded-xl"
                    />
                  </Link>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        className="font-semibold text-slate-900 hover:text-brand-700"
                        to={`/products/${item.product.id}`}
                      >
                        {item.product.name}
                      </Link>
                      {issue && (
                        <Badge tone="amber">
                          <TriangleAlert className="h-3 w-3" aria-hidden />
                          {issue.label}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {formatPrice(item.product.price)} / sản phẩm
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Còn {item.product.stock} trong kho
                    </p>
                    {issue && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-amber-700">{issue.hint}</p>
                        {issue.maxQuantity > 0 ? (
                          <button
                            className="btn-secondary btn-sm"
                            disabled={updateItem.isPending}
                            onClick={() => changeQuantity(item.id, issue.maxQuantity)}
                          >
                            Giảm còn {issue.maxQuantity}
                          </button>
                        ) : (
                          <button
                            className="btn-secondary btn-sm"
                            disabled={removeItem.isPending}
                            onClick={() => removeItem.mutate(item.id)}
                          >
                            Xoá khỏi giỏ
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 sm:flex-col sm:items-end">
                    <div className="flex items-center rounded-lg border border-slate-300 bg-white">
                      <button
                        className="rounded-l-lg px-2.5 py-2 text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40"
                        disabled={item.quantity <= 1 || updateItem.isPending}
                        onClick={() => changeQuantity(item.id, item.quantity - 1)}
                        aria-label="Giảm số lượng"
                      >
                        <Minus className="h-4 w-4" aria-hidden />
                      </button>
                      <span className="min-w-10 text-center text-sm font-semibold tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        className="rounded-r-lg px-2.5 py-2 text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40"
                        disabled={item.quantity >= item.product.stock || updateItem.isPending}
                        onClick={() => changeQuantity(item.id, item.quantity + 1)}
                        aria-label="Tăng số lượng"
                      >
                        <Plus className="h-4 w-4" aria-hidden />
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-bold text-slate-900">{formatPrice(item.subtotal)}</span>
                      <button
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        disabled={removeItem.isPending}
                        onClick={() => removeItem.mutate(item.id)}
                        aria-label={`Xoá ${item.product.name}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <aside className="card p-6 lg:sticky lg:top-24">
            <h2 className="font-semibold text-slate-900">Tóm tắt đơn hàng</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Số lượng</dt>
                <dd className="font-medium text-slate-900">{cart.totalItems} sản phẩm</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Tạm tính</dt>
                <dd className="font-medium text-slate-900">{formatPrice(cart.totalAmount)}</dd>
              </div>
              {blocked.length > 0 && (
                <div className="flex justify-between">
                  <dt className="text-amber-700">Cần xử lý</dt>
                  <dd className="font-medium text-amber-700">{blocked.length} sản phẩm</dd>
                </div>
              )}
            </dl>
            <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-4">
              <span className="font-semibold text-slate-900">Tổng cộng</span>
              <span className="text-xl font-bold text-slate-900">
                {formatPrice(cart.totalAmount)}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Chưa gồm phí vận chuyển và mã giảm giá — được tính ở bước thanh toán.
            </p>
            <button
              className="btn-primary btn-lg mt-5 w-full"
              disabled={blocked.length > 0}
              onClick={() => navigate('/checkout')}
            >
              Tiến hành thanh toán
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
            {blocked.length > 0 && (
              <p className="mt-2 text-center text-xs font-medium text-amber-700">
                Hãy xử lý {blocked.length} sản phẩm được đánh dấu ở trên trước khi thanh toán.
              </p>
            )}
            <Link className="btn-ghost mt-2 w-full" to="/products">
              Tiếp tục mua sắm
            </Link>
          </aside>
        </div>
      )}
    </AppShell>
  );
}
