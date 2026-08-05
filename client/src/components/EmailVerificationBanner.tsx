import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from './ui';
import {
  recoveryError,
  useRequestEmailVerification,
} from '../lib/recovery-api';

/**
 * Shown wherever an unverified account should be nudged. Nothing in the API is
 * gated on verification today, so the copy asks rather than warns — promising a
 * consequence that does not exist would be a lie the UI has to keep.
 */
export function EmailVerificationBanner({
  emailVerified,
}: {
  emailVerified: boolean;
}) {
  const request = useRequestEmailVerification();
  const [error, setError] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (emailVerified) return null;

  function send(): void {
    setError(null);
    request.mutate(undefined, {
      onSuccess: (result) => {
        setSent(true);
        // Present only outside production, where there is no mail transport.
        setDevToken(result.devToken ?? null);
      },
      onError: (reason) =>
        setError(recoveryError(reason, 'Không gửi được email xác minh.')),
    });
  }

  return (
    <div className="mb-6 grid gap-3">
      <Alert tone="warning">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>
            Email của bạn chưa được xác minh. Xác minh giúp bạn khôi phục tài
            khoản khi quên mật khẩu.
          </span>
          <button
            className="btn-secondary shrink-0"
            type="button"
            onClick={send}
            disabled={request.isPending}
          >
            {request.isPending ? 'Đang gửi...' : 'Gửi email xác minh'}
          </button>
        </div>
      </Alert>

      {sent && !devToken && (
        <Alert tone="success">
          Đã gửi liên kết xác minh. Liên kết có hiệu lực trong 24 giờ.
        </Alert>
      )}

      {devToken && (
        <Alert tone="info">
          <p className="font-medium">
            Bản chạy thử chưa cấu hình email — dùng liên kết bên dưới:
          </p>
          <Link className="link break-all" to={`/verify-email?token=${devToken}`}>
            /verify-email?token={devToken}
          </Link>
        </Alert>
      )}

      {error && <Alert>{error}</Alert>}
    </div>
  );
}
