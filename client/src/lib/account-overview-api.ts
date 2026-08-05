import { useQuery } from '@tanstack/react-query';
import { apiJson } from './api-client';
import { useAuthStore } from '../stores/auth-store';
import type { OrderStatus } from '../types/order';

/** Short list of things the customer can act on now, most time-sensitive first. */
export type AccountAction =
  | 'pending-payment'
  | 'awaiting-delivery'
  | 'review-invited'
  | 'verify-email';

export type AccountOverview = {
  orders: {
    total: number;
    /** Counts as spend — excludes PENDING and CANCELLED. */
    countable: number;
    byStatus: Record<OrderStatus, number>;
  };
  spend: { lifetime: string; average: string };
  saved: { wishlist: number; addresses: number; stockAlerts: number };
  reviews: { written: number; invited: number };
  actions: AccountAction[];
};

export const getAccountOverview = () =>
  apiJson<AccountOverview>('/api/me/overview');

/** Disabled without a token, or the panel spins forever for a visitor. */
export function useAccountOverview() {
  const signedIn = useAuthStore((state) => Boolean(state.tokens?.accessToken));
  return useQuery({
    queryKey: ['account-overview'],
    queryFn: getAccountOverview,
    enabled: signedIn,
  });
}

/**
 * Copy and destination per action. Kept beside the type so adding a member to
 * the union forces a decision here rather than silently rendering nothing.
 */
export const ACCOUNT_ACTION_COPY: Record<
  AccountAction,
  { title: string; body: string; to: string; cta: string }
> = {
  'pending-payment': {
    title: 'Đơn hàng đang chờ thanh toán',
    body: 'Đơn ở trạng thái chờ sẽ được giữ hàng cho tới khi bạn thanh toán.',
    to: '/orders?status=PENDING',
    cta: 'Xem đơn chờ',
  },
  'awaiting-delivery': {
    title: 'Đơn hàng đang trên đường giao',
    body: 'Bạn có đơn đã bàn giao cho đơn vị vận chuyển.',
    to: '/orders?status=SHIPPED',
    cta: 'Theo dõi đơn',
  },
  'review-invited': {
    title: 'Sản phẩm chờ bạn đánh giá',
    body: 'Bạn đã mua và nhận hàng nhưng chưa đánh giá những sản phẩm này.',
    to: '/orders?status=COMPLETED',
    cta: 'Viết đánh giá',
  },
  'verify-email': {
    title: 'Email chưa được xác minh',
    body: 'Xác minh giúp bạn khôi phục tài khoản khi quên mật khẩu.',
    to: '/account/profile',
    cta: 'Xác minh ngay',
  },
};
