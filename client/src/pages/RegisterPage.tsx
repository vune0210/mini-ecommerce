import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { AuthField, AuthLayout } from '../components/AuthLayout';
import { apiJson } from '../lib/api-client';
import type { AuthUser } from '../types/auth';

const schema = z.object({
  name: z.string().min(1, 'Vui lòng nhập họ tên').max(100),
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(8, 'Mật khẩu cần ít nhất 8 ký tự'),
});
type RegisterForm = z.infer<typeof schema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(schema) });

  async function onSubmit(values: RegisterForm): Promise<void> {
    setError(null);
    try {
      await apiJson<AuthUser>('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      navigate('/login', { replace: true });
    } catch {
      setError('Không thể tạo tài khoản. Email này có thể đã được đăng ký.');
    }
  }

  return (
    <AuthLayout
      title="Tạo tài khoản"
      subtitle="Chỉ mất một phút để bắt đầu mua sắm."
      onSubmit={handleSubmit(onSubmit)}
      error={error}
      footer={
        <>
          Đã có tài khoản?{' '}
          <Link className="link" to="/login">
            Đăng nhập
          </Link>
        </>
      }
    >
      <AuthField id="name" label="Họ và tên" error={errors.name?.message}>
        <input
          className="field"
          id="name"
          autoComplete="name"
          placeholder="Nguyễn Văn A"
          {...register('name')}
        />
      </AuthField>

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
            autoComplete="new-password"
            placeholder="Ít nhất 8 ký tự"
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
        {isSubmitting ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
      </button>
    </AuthLayout>
  );
}
