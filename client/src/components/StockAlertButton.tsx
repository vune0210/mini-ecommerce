import { BellPlus, BellRing } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert } from './ui';
import {
  stockAlertError,
  useIsWatchingStock,
  useSubscribeToStock,
  useUnsubscribeFromStock,
} from '../lib/stock-alert-api';
import { useAuthStore } from '../stores/auth-store';

/**
 * Only meaningful on a sold-out product: the server refuses a subscription to
 * something already on the shelf, because the crossing it waits for has
 * already happened. Callers should render it in place of "add to cart".
 */
export function StockAlertButton({ productId }: { productId: string }) {
  const signedIn = useAuthStore((state) => Boolean(state.tokens?.accessToken));
  const navigate = useNavigate();
  const location = useLocation();
  const watching = useIsWatchingStock(productId);
  const subscribe = useSubscribeToStock();
  const unsubscribe = useUnsubscribeFromStock();
  const [error, setError] = useState<string | null>(null);

  const busy = subscribe.isPending || unsubscribe.isPending;
  const isWatching = watching.data === true;

  function toggle(): void {
    setError(null);
    // Firing a request that is guaranteed to 401 just to show an error is a
    // worse answer than sending the visitor where they can actually act.
    if (!signedIn) {
      navigate('/login', { state: { from: location.pathname } });
      return;
    }
    const onError = (reason: unknown) => setError(stockAlertError(reason));
    if (isWatching) unsubscribe.mutate(productId, { onError });
    else subscribe.mutate(productId, { onError });
  }

  return (
    <div className="grid gap-2">
      <button
        className={isWatching ? 'btn-secondary' : 'btn-primary'}
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={isWatching}
      >
        {isWatching ? (
          <>
            <BellRing className="h-4 w-4" aria-hidden />
            Đang theo dõi — bỏ theo dõi
          </>
        ) : (
          <>
            <BellPlus className="h-4 w-4" aria-hidden />
            Báo tôi khi có hàng
          </>
        )}
      </button>
      <p className="text-sm text-slate-500">
        {isWatching
          ? 'Chúng tôi sẽ gửi thông báo ngay khi sản phẩm được nhập lại.'
          : 'Nhận thông báo trong ứng dụng ngay khi sản phẩm có hàng trở lại.'}
      </p>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
