import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, Save, ShieldCheck, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AccountShell } from '../../components/AccountShell';
import { EmailVerificationBanner } from '../../components/EmailVerificationBanner';
import { Alert, Badge, PageHeader, Panel, Skeleton } from '../../components/ui';
import { accountError, useMe, useUpdateProfile } from '../../lib/account-api';
import { useAuthStore } from '../../stores/auth-store';

const schema = z.object({
  name: z.string().trim().min(1, 'Vui lòng nhập họ tên').max(100, 'Tối đa 100 ký tự'),
});
type ProfileForm = z.infer<typeof schema>;

export function ProfilePage() {
  const stored = useAuthStore((state) => state.user);
  const me = useMe();
  const updateProfile = useUpdateProfile();
  const [saved, setSaved] = useState(false);

  // The persisted store answers instantly on a cold render; the query keeps it
  // honest if the name was changed on another device.
  const user = me.data ?? stored;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileForm>({
    resolver: zodResolver(schema),
    values: { name: user?.name ?? '' },
  });

  function onSubmit(form: ProfileForm): void {
    setSaved(false);
    updateProfile.mutate({ name: form.name.trim() }, { onSuccess: () => setSaved(true) });
  }

  return (
    <AccountShell>
      <PageHeader
        title="Hồ sơ"
        description="Thông tin hiển thị của bạn trong đơn hàng và đánh giá."
      />

      {/* Absent on tokens minted before verification existed; those accounts
          were backfilled as verified, so `?? true` keeps the nudge off them. */}
      <EmailVerificationBanner emailVerified={user?.emailVerified ?? true} />

      {me.isPending && !stored ? (
        <Skeleton className="h-64" />
      ) : me.isError && !stored ? (
        <Alert>{accountError(me.error)}</Alert>
      ) : (
        <div className="space-y-6">
          <section className="card flex flex-wrap items-center gap-5 p-6">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-600 text-2xl font-bold uppercase text-white">
              {user?.name.charAt(0) ?? '?'}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-bold tracking-tight text-slate-900">{user?.name}</h2>
                <Badge tone={user?.role === 'ADMIN' ? 'violet' : 'brand'}>
                  <ShieldCheck className="h-3 w-3" aria-hidden />
                  {user?.role === 'ADMIN' ? 'Quản trị viên' : 'Khách hàng'}
                </Badge>
              </div>
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-500">
                <Mail className="h-3.5 w-3.5" aria-hidden />
                {user?.email}
              </p>
            </div>
          </section>

          <Panel title="Chỉnh sửa thông tin" icon={UserRound}>
            <form className="grid gap-4 sm:max-w-md" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div>
                <label className="label" htmlFor="name">
                  Họ và tên
                </label>
                <input
                  className="field"
                  id="name"
                  autoComplete="name"
                  placeholder="Nguyễn Văn A"
                  {...register('name', { onChange: () => setSaved(false) })}
                />
                {errors.name && <p className="mt-1.5 text-sm text-red-600">{errors.name.message}</p>}
              </div>

              <div>
                <label className="label" htmlFor="email">
                  Email
                </label>
                <input className="field" id="email" value={user?.email ?? ''} disabled readOnly />
                {/* The API has no mail transport to verify a new address, so it
                    refuses email changes outright — saying so beats a 400. */}
                <p className="mt-1.5 text-xs text-slate-400">
                  Email dùng để đăng nhập nên không thể tự đổi. Liên hệ hỗ trợ nếu bạn cần thay đổi.
                </p>
              </div>

              {updateProfile.isError && <Alert>{accountError(updateProfile.error)}</Alert>}
              {saved && <Alert tone="success">Đã lưu thông tin hồ sơ.</Alert>}

              <div>
                <button className="btn-primary" disabled={updateProfile.isPending} type="submit">
                  <Save className="h-4 w-4" aria-hidden />
                  {updateProfile.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </Panel>
        </div>
      )}
    </AccountShell>
  );
}
