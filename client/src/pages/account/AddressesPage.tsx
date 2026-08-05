import { zodResolver } from '@hookform/resolvers/zod';
import { MapPin, Pencil, Phone, Plus, Star, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AccountShell } from '../../components/AccountShell';
import { Alert, Badge, EmptyState, PageHeader, Panel, SkeletonList } from '../../components/ui';
import {
  accountError,
  useAddresses,
  useCreateAddress,
  useDeleteAddress,
  useSetDefaultAddress,
  useUpdateAddress,
} from '../../lib/account-api';
import { shippingAddress } from '../../lib/format';
import type { Address, AddressInput } from '../../types/account';

/** Same shape the API enforces, so the book cannot hold a number checkout rejects. */
const phonePattern = /^(0\d{9,10}|\+84\d{9,10})$/;

const schema = z.object({
  label: z.string().trim().max(50, 'Tối đa 50 ký tự'),
  recipientName: z
    .string()
    .trim()
    .min(2, 'Tên người nhận cần ít nhất 2 ký tự')
    .max(100, 'Tối đa 100 ký tự'),
  phone: z.string().trim().regex(phonePattern, 'Số điện thoại không hợp lệ (ví dụ 0901234567)'),
  addressLine: z
    .string()
    .trim()
    .min(5, 'Địa chỉ cần ít nhất 5 ký tự')
    .max(255, 'Tối đa 255 ký tự'),
  ward: z.string().trim().max(100, 'Tối đa 100 ký tự'),
  district: z.string().trim().max(100, 'Tối đa 100 ký tự'),
  city: z.string().trim().min(2, 'Vui lòng nhập tỉnh/thành phố').max(100, 'Tối đa 100 ký tự'),
  isDefault: z.boolean(),
});
type AddressForm = z.infer<typeof schema>;

const emptyForm: AddressForm = {
  label: '',
  recipientName: '',
  phone: '',
  addressLine: '',
  ward: '',
  district: '',
  city: '',
  isDefault: false,
};

function toForm(address: Address): AddressForm {
  return {
    label: address.label ?? '',
    recipientName: address.recipientName,
    phone: address.phone,
    addressLine: address.addressLine,
    ward: address.ward ?? '',
    district: address.district ?? '',
    city: address.city,
    isDefault: address.isDefault,
  };
}

/**
 * Optional fields travel even when blank: the API turns '' into null, which is
 * how an edit clears a ward or a nickname. `isDefault` only ever goes up —
 * the API refuses to demote, callers promote a different address instead.
 */
function toPayload(form: AddressForm): AddressInput {
  return {
    label: form.label,
    recipientName: form.recipientName,
    phone: form.phone,
    addressLine: form.addressLine,
    ward: form.ward,
    district: form.district,
    city: form.city,
    ...(form.isDefault ? { isDefault: true } : {}),
  };
}

type EditorProps = { address: Address | null; isFirst: boolean; onClose: () => void };

function AddressEditor({ address, isFirst, onClose }: EditorProps) {
  const create = useCreateAddress();
  const update = useUpdateAddress();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AddressForm>({
    resolver: zodResolver(schema),
    defaultValues: address ? toForm(address) : emptyForm,
  });

  const pending = create.isPending || update.isPending;
  const failure = create.error ?? update.error;
  const lockedDefault = isFirst || address?.isDefault === true;

  function onSubmit(form: AddressForm): void {
    const payload = toPayload(form);
    if (address) update.mutate({ id: address.id, ...payload }, { onSuccess: onClose });
    else create.mutate(payload, { onSuccess: onClose });
  }

  return (
    <Panel
      className="mb-6"
      title={address ? 'Sửa địa chỉ' : 'Thêm địa chỉ mới'}
      icon={MapPin}
      action={
        <button className="btn-ghost btn-sm" type="button" onClick={onClose}>
          <X className="h-4 w-4" aria-hidden />
          Đóng
        </button>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div>
          <label className="label" htmlFor="label">
            Tên gợi nhớ <span className="font-normal text-slate-400">(không bắt buộc)</span>
          </label>
          <input className="field" id="label" placeholder="Nhà riêng, Công ty..." {...register('label')} />
          {errors.label && <p className="mt-1.5 text-sm text-red-600">{errors.label.message}</p>}
        </div>
        <div>
          <label className="label" htmlFor="recipientName">
            Người nhận
          </label>
          <input
            className="field"
            id="recipientName"
            autoComplete="name"
            placeholder="Nguyễn Văn A"
            {...register('recipientName')}
          />
          {errors.recipientName && (
            <p className="mt-1.5 text-sm text-red-600">{errors.recipientName.message}</p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="phone">
            Số điện thoại
          </label>
          <input
            className="field"
            id="phone"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0901234567"
            {...register('phone')}
          />
          {errors.phone && <p className="mt-1.5 text-sm text-red-600">{errors.phone.message}</p>}
        </div>
        <div>
          <label className="label" htmlFor="city">
            Tỉnh/Thành phố
          </label>
          <input
            className="field"
            id="city"
            placeholder="TP. Hồ Chí Minh"
            {...register('city')}
          />
          {errors.city && <p className="mt-1.5 text-sm text-red-600">{errors.city.message}</p>}
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="addressLine">
            Địa chỉ
          </label>
          <input
            className="field"
            id="addressLine"
            placeholder="Số nhà, tên đường"
            {...register('addressLine')}
          />
          {errors.addressLine && (
            <p className="mt-1.5 text-sm text-red-600">{errors.addressLine.message}</p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="ward">
            Phường/Xã <span className="font-normal text-slate-400">(không bắt buộc)</span>
          </label>
          <input className="field" id="ward" {...register('ward')} />
          {errors.ward && <p className="mt-1.5 text-sm text-red-600">{errors.ward.message}</p>}
        </div>
        <div>
          <label className="label" htmlFor="district">
            Quận/Huyện <span className="font-normal text-slate-400">(không bắt buộc)</span>
          </label>
          <input className="field" id="district" {...register('district')} />
          {errors.district && (
            <p className="mt-1.5 text-sm text-red-600">{errors.district.message}</p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label className="flex items-center gap-2.5 text-sm text-slate-700">
            <input
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              type="checkbox"
              disabled={lockedDefault}
              {...register('isDefault')}
            />
            Đặt làm địa chỉ mặc định
          </label>
          {lockedDefault && (
            <p className="mt-1.5 text-xs text-slate-400">
              {isFirst
                ? 'Địa chỉ đầu tiên luôn là mặc định.'
                : 'Đây đang là địa chỉ mặc định. Hãy chọn “Đặt mặc định” ở một địa chỉ khác để thay thế.'}
            </p>
          )}
        </div>

        {failure && (
          <div className="sm:col-span-2">
            <Alert>{accountError(failure)}</Alert>
          </div>
        )}

        <div className="flex gap-2 sm:col-span-2">
          <button className="btn-primary" disabled={pending} type="submit">
            {pending ? 'Đang lưu...' : address ? 'Lưu thay đổi' : 'Thêm địa chỉ'}
          </button>
          <button className="btn-secondary" disabled={pending} type="button" onClick={onClose}>
            Huỷ
          </button>
        </div>
      </form>
    </Panel>
  );
}

export function AddressesPage() {
  const addresses = useAddresses();
  const remove = useDeleteAddress();
  const setDefault = useSetDefaultAddress();
  const [editing, setEditing] = useState<Address | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = addresses.data ?? [];
  const busy = remove.isPending || setDefault.isPending;
  const onError = (reason: unknown) => setError(accountError(reason));

  function removeAddress(address: Address): void {
    setError(null);
    const warning = address.isDefault
      ? 'Xoá địa chỉ mặc định này? Một địa chỉ khác sẽ được chọn làm mặc định thay thế.'
      : `Xoá địa chỉ của “${address.recipientName}”?`;
    if (!window.confirm(warning)) return;
    remove.mutate(address.id, { onError });
  }

  function promote(address: Address): void {
    setError(null);
    setDefault.mutate(address.id, { onError });
  }

  return (
    <AccountShell>
      <PageHeader
        title="Sổ địa chỉ"
        description="Địa chỉ đã lưu để đặt hàng nhanh hơn. Địa chỉ mặc định được chọn sẵn khi thanh toán."
        action={
          !editing && (
            <button className="btn-primary" onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" aria-hidden />
              Thêm địa chỉ
            </button>
          )
        }
      />

      {editing && (
        <AddressEditor
          key={editing === 'new' ? 'new' : editing.id}
          address={editing === 'new' ? null : editing}
          isFirst={editing === 'new' && items.length === 0}
          onClose={() => setEditing(null)}
        />
      )}

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {addresses.isPending ? (
        <SkeletonList count={2} className="h-40" />
      ) : addresses.isError ? (
        <Alert>{accountError(addresses.error)}</Alert>
      ) : items.length === 0 ? (
        !editing && (
          <EmptyState
            icon={MapPin}
            title="Chưa có địa chỉ nào"
            description="Lưu địa chỉ giao hàng để những lần đặt hàng sau chỉ còn vài cú nhấp."
            action={
              <button className="btn-primary" onClick={() => setEditing('new')}>
                <Plus className="h-4 w-4" aria-hidden />
                Thêm địa chỉ
              </button>
            }
          />
        )
      ) : (
        <div className={`grid gap-4 transition-opacity ${addresses.isFetching ? 'opacity-60' : ''}`}>
          {items.map((address) => (
            <Panel
              key={address.id}
              className={address.isDefault ? 'ring-2 ring-brand-500 ring-offset-2' : ''}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-slate-900">{address.recipientName}</h2>
                    {address.isDefault && (
                      <Badge tone="brand">
                        <Star className="h-3 w-3 fill-current" aria-hidden />
                        Mặc định
                      </Badge>
                    )}
                    {address.label && <Badge tone="slate">{address.label}</Badge>}
                  </div>
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-500">
                    <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {address.phone}
                  </p>
                  <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-600">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                    {shippingAddress(address)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {!address.isDefault && (
                    <button
                      className="btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => promote(address)}
                    >
                      <Star className="h-3.5 w-3.5" aria-hidden />
                      Đặt mặc định
                    </button>
                  )}
                  <button
                    className="btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() => setEditing(address)}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    Sửa
                  </button>
                  <button
                    className="btn-danger btn-sm"
                    disabled={busy}
                    onClick={() => removeAddress(address)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Xoá
                  </button>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </AccountShell>
  );
}
