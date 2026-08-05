import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { AuthField, AuthLayout } from '../components/AuthLayout';
import { Alert } from '../components/ui';
import { recoveryError, useResetPassword } from '../lib/recovery-api';

const schema = z
  .object({
    // The minted token is 256 bits; anything shorter cannot be genuine, and the
    // server rejects it before paying for a hash. Mirrored here so a truncated
    // paste is caught without a round trip.
    token: z.string().min(16, 'Mã đặt lại không hợp lệ'),
    newPassword: z.string().min(8, 'Mật khẩu cần ít nhất 8 ký tự').max(72),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Mật khẩu nhập lại không khớp',
  });
type ResetForm = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetForm>({
    resolver: zodResolver(schema),
    // The link carries the token; a customer who pasted it should never have to
    // retype it, and one who opened the page directly can still type it in.
    defaultValues: { token: searchParams.get('token') ?? '' },
  });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const reset = useResetPassword();

  function onSubmit(values: ResetForm): void {
    setError(null);
    reset.mutate(
      { token: values.token, newPassword: values.newPassword },
      {
        onSuccess: () => setDone(true),
        onError: (reason) =>
          setError(
            recoveryError(
              reason,
              'Mã đặt lại không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.',
            ),
          ),
      },
    );
  }

  return (
    <AuthLayout
      title="Đặt lại mật khẩu"
      subtitle="Chọn mật khẩu mới cho tài khoản của bạn."
      onSubmit={handleSubmit(onSubmit)}
      error={error}
      footer={
        <>
          Chưa có mã?{' '}
          <Link className="link" to="/forgot-password">
            Gửi lại liên kết
          </Link>
        </>
      }
    >
      {done ? (
        <div className="grid gap-4">
          <Alert tone="success">
            Đã đổi mật khẩu. Mọi phiên đăng nhập cũ đã bị đăng xuất — kể cả trên
            thiết bị khác.
          </Alert>
          <button
            className="btn-primary w-full"
            type="button"
            onClick={() => navigate('/login', { replace: true })}
          >
            Đăng nhập với mật khẩu mới
          </button>
        </div>
      ) : (
        <>
          <AuthField id="token" label="Mã đặt lại" error={errors.token?.message}>
            <input
              className="field"
              id="token"
              type="text"
              autoComplete="one-time-code"
              placeholder="Dán mã từ email"
              {...register('token')}
            />
          </AuthField>

          <AuthField
            id="newPassword"
            label="Mật khẩu mới"
            error={errors.newPassword?.message}
          >
            <div className="relative">
              <input
                className="field pr-11"
                id="newPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                {...register('newPassword')}
              />
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden />
                )}
              </button>
            </div>
          </AuthField>

          <AuthField
            id="confirmPassword"
            label="Nhập lại mật khẩu mới"
            error={errors.confirmPassword?.message}
          >
            <input
              className="field"
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              {...register('confirmPassword')}
            />
          </AuthField>

          <button
            className="btn-primary mt-2 w-full"
            type="submit"
            disabled={reset.isPending}
          >
            {reset.isPending ? 'Đang đổi...' : 'Đổi mật khẩu'}
          </button>
        </>
      )}
    </AuthLayout>
  );
}
