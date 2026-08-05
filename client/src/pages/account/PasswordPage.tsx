import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, KeyRound, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { AccountShell } from '../../components/AccountShell';
import { Alert, PageHeader, Panel } from '../../components/ui';
import { accountError, useChangePassword } from '../../lib/account-api';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại'),
    // bcrypt bỏ qua phần vượt quá 72 byte, nên API cũng chặn ở đó.
    newPassword: z
      .string()
      .min(8, 'Mật khẩu mới cần ít nhất 8 ký tự')
      .max(72, 'Mật khẩu tối đa 72 ký tự'),
    confirmPassword: z.string().min(1, 'Vui lòng nhập lại mật khẩu mới'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Mật khẩu nhập lại không khớp',
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    path: ['newPassword'],
    message: 'Mật khẩu mới phải khác mật khẩu hiện tại',
  });
type PasswordForm = z.infer<typeof schema>;

type FieldName = keyof PasswordForm;

const fields: Array<{ name: FieldName; label: string; autoComplete: string; placeholder: string }> = [
  {
    name: 'currentPassword',
    label: 'Mật khẩu hiện tại',
    autoComplete: 'current-password',
    placeholder: 'Mật khẩu đang dùng',
  },
  {
    name: 'newPassword',
    label: 'Mật khẩu mới',
    autoComplete: 'new-password',
    placeholder: 'Ít nhất 8 ký tự',
  },
  {
    name: 'confirmPassword',
    label: 'Nhập lại mật khẩu mới',
    autoComplete: 'new-password',
    placeholder: 'Nhập lại chính xác mật khẩu mới',
  },
];

export function PasswordPage() {
  const changePassword = useChangePassword();
  const [visible, setVisible] = useState<Record<FieldName, boolean>>({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordForm>({ resolver: zodResolver(schema) });

  function onSubmit(form: PasswordForm): void {
    setDone(false);
    changePassword.mutate(
      { currentPassword: form.currentPassword, newPassword: form.newPassword },
      {
        // The hook stores the replacement token pair the API returns; without
        // it this tab would be signed out along with every other device.
        onSuccess: () => {
          setDone(true);
          reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
        },
      },
    );
  }

  return (
    <AccountShell>
      <PageHeader
        title="Đổi mật khẩu"
        description="Đặt lại mật khẩu đăng nhập cho tài khoản của bạn."
      />

      <div className="space-y-6">
        <Alert tone="warning">
          <p className="font-semibold">Mọi thiết bị khác sẽ bị đăng xuất</p>
          <p className="mt-1">
            Khi đổi mật khẩu thành công, tất cả phiên đăng nhập hiện có đều bị thu hồi. Thiết bị bạn
            đang dùng được cấp phiên mới nên vẫn ở lại; các điện thoại, máy tính khác sẽ phải đăng
            nhập lại bằng mật khẩu mới.
          </p>
        </Alert>

        <Panel title="Mật khẩu" icon={KeyRound}>
          <form className="grid gap-4 sm:max-w-md" onSubmit={handleSubmit(onSubmit)} noValidate>
            {fields.map((field) => (
              <div key={field.name}>
                <label className="label" htmlFor={field.name}>
                  {field.label}
                </label>
                <div className="relative">
                  <input
                    className="field pr-11"
                    id={field.name}
                    type={visible[field.name] ? 'text' : 'password'}
                    autoComplete={field.autoComplete}
                    placeholder={field.placeholder}
                    {...register(field.name, { onChange: () => setDone(false) })}
                  />
                  <button
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-400 hover:text-slate-600"
                    type="button"
                    onClick={() =>
                      setVisible((current) => ({ ...current, [field.name]: !current[field.name] }))
                    }
                    aria-label={visible[field.name] ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {visible[field.name] ? (
                      <EyeOff className="h-4 w-4" aria-hidden />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                </div>
                {errors[field.name] && (
                  <p className="mt-1.5 text-sm text-red-600">{errors[field.name]?.message}</p>
                )}
              </div>
            ))}

            {changePassword.isError && <Alert>{accountError(changePassword.error)}</Alert>}
            {done && (
              <Alert tone="success">
                Đã đổi mật khẩu. Thiết bị này vẫn đăng nhập bình thường, các thiết bị khác đã bị đăng
                xuất.{' '}
                <Link className="font-semibold underline underline-offset-2" to="/account/sessions">
                  Xem thiết bị đang đăng nhập
                </Link>
              </Alert>
            )}

            <div>
              <button className="btn-primary" disabled={changePassword.isPending} type="submit">
                <ShieldAlert className="h-4 w-4" aria-hidden />
                {changePassword.isPending ? 'Đang cập nhật...' : 'Đổi mật khẩu'}
              </button>
            </div>
          </form>
        </Panel>
      </div>
    </AccountShell>
  );
}
