import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { AuthField, AuthLayout } from '../components/AuthLayout';
import { apiJson } from '../lib/api-client';
import { useAuthStore } from '../stores/auth-store';
import type { AuthTokens, AuthUser } from '../types/auth';

const schema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(8, 'Mật khẩu cần ít nhất 8 ký tự'),
});
type LoginForm = z.infer<typeof schema>;
type LoginResponse = { user: AuthUser } & AuthTokens;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((state) => state.setAuth);
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(schema) });
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(values: LoginForm): Promise<void> {
    setError(null);
    try {
      const response = await apiJson<LoginResponse>('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      setAuth(response.user, response);
      navigate(from, { replace: true });
    } catch {
      setError('Email hoặc mật khẩu không đúng.');
    }
  }

  return (
    <AuthLayout
      title="Đăng nhập"
      subtitle="Chào mừng trở lại! Nhập thông tin tài khoản của bạn."
      onSubmit={handleSubmit(onSubmit)}
      error={error}
      footer={
        <>
          Chưa có tài khoản?{' '}
          <Link className="link" to="/register">
            Đăng ký ngay
          </Link>
        </>
      }
    >
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

      <AuthField id="password" label="Mật khẩu" error={errors.password?.message}>
        <div className="relative">
          <input
            className="field pr-11"
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            {...register('password')}
          />
          <button
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-400 hover:text-slate-600"
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </AuthField>

      <button className="btn-primary w-full" disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
      </button>
    </AuthLayout>
  );
}
