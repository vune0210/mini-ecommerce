import { CircleCheckBig, ShoppingBag } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Skeleton } from '../components/ui';
import {
  recoveryError,
  useConfirmEmailVerification,
} from '../lib/recovery-api';

/**
 * Opened from a link in a mail client, which carries no bearer token — the
 * token in the URL is the whole credential, so this page is public.
 */
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const confirm = useConfirmEmailVerification();
  // Mail clients and link scanners prefetch, and React 18 StrictMode mounts
  // effects twice in development. The token is single-use, so firing it twice
  // would make the second call report an already-consumed token as a failure.
  const requested = useRef(false);

  useEffect(() => {
    if (!token || requested.current) return;
    requested.current = true;
    confirm.mutate(token);
  }, [confirm, token]);

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <div className="w-full max-w-md">
        <Link
          className="mb-8 flex items-center justify-center gap-2.5 text-slate-900"
          to="/products"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">
            <ShoppingBag className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-lg font-bold tracking-tight">MiniShop</span>
        </Link>

        <div className="card p-6">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Xác minh email
          </h1>

          <div className="mt-5 grid gap-4">
            {!token && (
              <Alert>
                Liên kết không hợp lệ: thiếu mã xác minh. Hãy mở lại liên kết
                trong email, hoặc yêu cầu gửi lại từ trang{' '}
                <Link className="link" to="/account/profile">
                  hồ sơ
                </Link>
                .
              </Alert>
            )}

            {token && confirm.isPending && (
              <>
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-5 w-1/2" />
              </>
            )}

            {confirm.isSuccess && (
              <>
                <Alert tone="success">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <CircleCheckBig className="h-4 w-4" aria-hidden />
                    Email của bạn đã được xác minh.
                  </span>
                </Alert>
                <Link className="btn-primary w-full justify-center" to="/account/profile">
                  Về trang hồ sơ
                </Link>
              </>
            )}

            {confirm.isError && (
              <>
                <Alert>
                  {recoveryError(
                    confirm.error,
                    'Mã xác minh không hợp lệ hoặc đã hết hạn.',
                  )}
                </Alert>
                {/*
                  A consumed token also lands here, and that is the common case:
                  a scanner opened the link first. Saying so keeps a customer
                  whose address is already verified from thinking it failed.
                */}
                <p className="text-sm text-slate-500">
                  Nếu bạn đã bấm liên kết này trước đó, email có thể đã được xác
                  minh rồi — mỗi mã chỉ dùng được một lần. Kiểm tra ở trang hồ sơ
                  hoặc yêu cầu gửi lại mã mới.
                </p>
                <Link className="btn-secondary w-full justify-center" to="/account/profile">
                  Kiểm tra trạng thái tài khoản
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
