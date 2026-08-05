import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { AuthField, AuthLayout } from '../components/AuthLayout';
import { Alert } from '../components/ui';
import { recoveryError, useRequestPasswordReset } from '../lib/recovery-api';

const schema = z.object({
  email: z.string().email('Email không hợp lệ'),
});
type ForgotForm = z.infer<typeof schema>;

export function ForgotPasswordPage() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotForm>({ resolver: zodResolver(schema) });
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const request = useRequestPasswordReset();

  function onSubmit(values: ForgotForm): void {
    setError(null);
    request.mutate(values.email, {
      onSuccess: () => setSent(true),
      onError: (reason) =>
        setError(recoveryError(reason, 'Không gửi được yêu cầu. Thử lại sau.')),
    });
  }

  return (
    <AuthLayout
      title="Quên mật khẩu"
      subtitle="Nhập email của bạn, chúng tôi sẽ gửi liên kết đặt lại mật khẩu."
      onSubmit={handleSubmit(onSubmit)}
      error={error}
      footer={
        <>
          Nhớ ra mật khẩu rồi?{' '}
          <Link className="link" to="/login">
            Quay lại đăng nhập
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="grid gap-4">
          <Alert tone="success">
            Nếu email này có tài khoản, liên kết đặt lại mật khẩu đã được gửi
            đi. Liên kết có hiệu lực trong 1 giờ và chỉ dùng được một lần.
          </Alert>
          {/*
            The server answers identically for a registered and an unregistered
            address on purpose — a different reply would let anyone test whether
            an email has an account here. Saying so is more useful than letting
            the customer wonder why nothing arrived.
          */}
          <p className="text-sm text-slate-500">
            Vì lý do bảo mật, trang này luôn hiển thị cùng một thông báo dù email
            có tài khoản hay không.
          </p>
          {import.meta.env.DEV && (
            <Alert tone="warning">
              Bản chạy thử chưa cấu hình email. Mở log của server để lấy liên kết
              đặt lại, rồi dán mã vào trang{' '}
              <Link className="link" to="/reset-password">
                đặt lại mật khẩu
              </Link>
              .
            </Alert>
          )}
        </div>
      ) : (
        <>
          <AuthField id="email" label="Email" error={errors.email?.message}>
            <input
              className="field"
              id="email"
              type="email"
              autoComplete="email"
              placeholder="ban@example.com"
              {...register('email')}
            />
          </AuthField>
          <button
            className="btn-primary mt-2 w-full"
            type="submit"
            disabled={request.isPending}
          >
            {request.isPending ? 'Đang gửi...' : 'Gửi liên kết đặt lại'}
          </button>
        </>
      )}
    </AuthLayout>
  );
}
