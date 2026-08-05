import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, CalendarClock, PackageX, Receipt, RotateCcw, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { AppShell } from '../components/AppShell';
import { Alert, EmptyState, PageHeader, Panel, Skeleton } from '../components/ui';
import { formatDate, formatDateTime, formatPrice } from '../lib/format';
import { useOrder, useOrderHistory } from '../lib/order-api';
import {
  RETURN_REASON_LABEL,
  RETURN_REASONS,
  RETURN_WINDOW_DAYS,
  refundPreview,
  returnableLines,
  returnErrorMessage,
  returnFailureMessage,
  returnLineFailures,
  returnWindowDaysLeft,
  returnWindowEndsAt,
  useCreateReturn,
  useOrderReturns,
  withinReturnWindow,
} from '../lib/return-api';

/**
 * `reason` starts empty so nothing is filed under a default the customer never
 * picked; the empty literal is refused in `superRefine` rather than by the enum,
 * which lets the message be ours. Quantities arrive from a number input, where
 * an emptied field reads as NaN — `.catch(0)` turns that into the same "ít nhất
 * 1" message instead of a type error the customer cannot act on.
 */
const schema = z
  .object({
    reason: z.union([z.literal(''), z.enum(RETURN_REASONS)]),
    note: z.string().max(500, 'Ghi chú tối đa 500 ký tự.'),
    lines: z.array(
      z.object({
        orderItemId: z.string(),
        productName: z.string(),
        unitPrice: z.string(),
        remaining: z.number(),
        selected: z.boolean(),
        quantity: z.number().catch(0),
      }),
    ),
  })
  .superRefine((values, context) => {
    const custom = z.ZodIssueCode.custom;
    if (!values.reason)
      context.addIssue({ code: custom, path: ['reason'], message: 'Vui lòng chọn lý do trả hàng.' });
    if (!values.lines.some((line) => line.selected))
      context.addIssue({
        code: custom,
        path: ['lines'],
        message: 'Chọn ít nhất một sản phẩm cần trả.',
      });
    values.lines.forEach((line, index) => {
      if (!line.selected) return;
      if (!Number.isInteger(line.quantity) || line.quantity < 1)
        context.addIssue({
          code: custom,
          path: ['lines', index, 'quantity'],
          message: 'Số lượng phải là số nguyên từ 1 trở lên.',
        });
      else if (line.quantity > line.remaining)
        context.addIssue({
          code: custom,
          path: ['lines', index, 'quantity'],
          message: `Chỉ còn có thể trả tối đa ${line.remaining}.`,
        });
    });
  });

type ReturnForm = z.infer<typeof schema>;

export function ReturnRequestPage() {
  const [params] = useSearchParams();
  const orderId = params.get('orderId') ?? '';
  const orderQuery = useOrder(orderId);
  const historyQuery = useOrderHistory(orderId);
  const claimsQuery = useOrderReturns(orderId);
  const create = useCreateReturn();
  const navigate = useNavigate();
  const order = orderQuery.data;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ReturnForm>({
    resolver: zodResolver(schema),
    defaultValues: { reason: '', note: '', lines: [] },
  });

  /**
   * When the order became returnable, read the way the server reads it: the
   * latest COMPLETED event, falling back to the order's own timestamp for orders
   * that predate the history table.
   */
  const completedAt = useMemo(() => {
    const events = historyQuery.data ?? [];
    for (let index = events.length - 1; index >= 0; index -= 1)
      if (events[index].toStatus === 'COMPLETED') return events[index].createdAt;
    return order?.updatedAt ?? null;
  }, [historyQuery.data, order?.updatedAt]);

  const lines = useMemo(
    () => (order && claimsQuery.data ? returnableLines(order.items, claimsQuery.data) : []),
    [order, claimsQuery.data],
  );

  // Seeded once: re-seeding on every refetch would wipe a half-filled form.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !lines.length) return;
    seeded.current = true;
    reset({
      reason: '',
      note: '',
      lines: lines.map((line) => ({
        orderItemId: line.orderItemId,
        productName: line.productName,
        unitPrice: line.unitPrice,
        remaining: line.remaining,
        selected: false,
        quantity: line.remaining > 0 ? 1 : 0,
      })),
    });
  }, [lines, reset]);

  const watchedLines = watch('lines');
  const refund = refundPreview(
    watchedLines.filter((line) => line.selected && Number.isFinite(line.quantity) && line.quantity > 0),
  );
  const failures = returnLineFailures(create.error);
  const nameOf = (orderItemId: string): string =>
    lines.find((line) => line.orderItemId === orderItemId)?.productName ?? '';

  const loading = orderQuery.isPending || claimsQuery.isPending || historyQuery.isPending;
  const deadline = completedAt ? returnWindowEndsAt(completedAt) : null;
  const inWindow = completedAt ? withinReturnWindow(completedAt) : false;
  const completed = order?.status === 'COMPLETED';
  const anythingLeft = lines.some((line) => line.remaining > 0);
  const canFile = Boolean(order) && completed && inWindow && anythingLeft;

  function onSubmit(values: ReturnForm): void {
    if (!values.reason || !order) return;
    create.mutate(
      {
        orderId: order.id,
        reason: values.reason,
        ...(values.note.trim() ? { note: values.note.trim() } : {}),
        items: values.lines
          .filter((line) => line.selected)
          .map((line) => ({ orderItemId: line.orderItemId, quantity: line.quantity })),
      },
      { onSuccess: (created) => navigate(`/returns/${created.id}`) },
    );
  }

  if (!orderId)
    return (
      <AppShell width="md">
        <EmptyState
          icon={Receipt}
          title="Chưa chọn đơn hàng"
          description="Hãy mở đơn hàng bạn muốn trả và bấm “Yêu cầu trả hàng” từ trang chi tiết đơn."
          action={
            <Link className="btn-primary" to="/orders">
              Tới đơn hàng của tôi
            </Link>
          }
        />
      </AppShell>
    );

  return (
    <AppShell width="lg">
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-16 w-72" />
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
      ) : orderQuery.isError || !order ? (
        <EmptyState
          icon={PackageX}
          title="Không tìm thấy đơn hàng"
          description="Đơn hàng không tồn tại hoặc bạn không có quyền xem."
          action={
            <Link className="btn-primary" to="/orders">
              Quay lại đơn hàng
            </Link>
          }
        />
      ) : (
        <>
          <Link className="btn-ghost btn-sm -ml-3 mb-4" to={`/orders/${order.id}`}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Quay lại đơn {order.orderNumber}
          </Link>

          <PageHeader
            eyebrow="Trả hàng"
            title={`Yêu cầu trả hàng cho đơn ${order.orderNumber}`}
            description="Chọn sản phẩm cần trả, số lượng và lý do. Yêu cầu sẽ được bộ phận hỗ trợ duyệt trước khi bạn gửi hàng về."
          />

          {/* The window is the rule most likely to refuse the form, so it is
              stated before anything is filled in — not after a 400. */}
          <div className="mb-6 space-y-3">
            <Alert tone={completed && inWindow ? 'info' : 'warning'}>
              <p className="font-semibold">
                Thời hạn trả hàng: {RETURN_WINDOW_DAYS} ngày kể từ khi đơn hoàn tất
              </p>
              {completed && completedAt ? (
                <p className="mt-1">
                  Đơn hoàn tất lúc {formatDateTime(completedAt)}
                  {deadline && ` · hạn cuối ${formatDate(deadline.toISOString())}`}
                  {inWindow
                    ? ` · còn ${returnWindowDaysLeft(completedAt)} ngày`
                    : ' · đã quá hạn'}
                  .
                </p>
              ) : (
                <p className="mt-1">
                  Chỉ đơn hàng đã hoàn tất mới có thể trả. Đơn đang huỷ hoặc chưa giao xong thì bạn
                  huỷ đơn thay vì trả hàng.
                </p>
              )}
            </Alert>

            {completed && !inWindow && (
              <Alert>
                Đã quá thời hạn {RETURN_WINDOW_DAYS} ngày, không thể tạo yêu cầu trả hàng cho đơn
                này. Vui lòng liên hệ bộ phận hỗ trợ nếu bạn cần trợ giúp.
              </Alert>
            )}

            {completed && inWindow && !anythingLeft && (
              <Alert tone="warning">
                Toàn bộ sản phẩm trong đơn đã nằm trong một yêu cầu trả hàng khác.{' '}
                <Link className="link" to="/returns">
                  Xem các yêu cầu trả hàng của bạn
                </Link>
                .
              </Alert>
            )}
          </div>

          {canFile && (
            <form className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" onSubmit={handleSubmit(onSubmit)}>
              <div className="space-y-6">
                <Panel title="Sản phẩm cần trả" icon={Undo2}>
                  {errors.lines?.message && (
                    <p className="mb-3 text-xs font-medium text-red-600">{errors.lines.message}</p>
                  )}
                  <ul className="space-y-2">
                    {lines.map((line, index) => {
                      const exhausted = line.remaining === 0;
                      const picked = watchedLines[index]?.selected ?? false;
                      return (
                        <li key={line.orderItemId}>
                          <div
                            className={`rounded-xl border p-4 transition-colors ${
                              exhausted
                                ? 'border-slate-200 bg-slate-50'
                                : picked
                                  ? 'border-brand-500 bg-brand-50/50'
                                  : 'border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                className="mt-1 shrink-0 text-brand-600 focus:ring-brand-500"
                                type="checkbox"
                                id={`line-${index}`}
                                disabled={exhausted}
                                {...register(`lines.${index}.selected`)}
                              />
                              <div className="min-w-0 flex-1">
                                <label
                                  className="block cursor-pointer font-medium text-slate-900"
                                  htmlFor={`line-${index}`}
                                >
                                  {line.productName}
                                </label>
                                <p className="mt-0.5 text-sm text-slate-500">
                                  {formatPrice(line.unitPrice)} · đã mua {line.purchased}
                                  {line.claimed > 0 && ` · đã yêu cầu trả ${line.claimed}`}
                                </p>
                                {exhausted ? (
                                  <p className="mt-2 text-sm font-medium text-slate-500">
                                    Không còn sản phẩm nào có thể trả cho dòng này.
                                  </p>
                                ) : (
                                  <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <label
                                      className="text-sm text-slate-600"
                                      htmlFor={`quantity-${index}`}
                                    >
                                      Số lượng trả
                                    </label>
                                    <input
                                      className="field w-24 py-1.5"
                                      id={`quantity-${index}`}
                                      type="number"
                                      min={1}
                                      max={line.remaining}
                                      step={1}
                                      disabled={!picked}
                                      {...register(`lines.${index}.quantity`, {
                                        valueAsNumber: true,
                                      })}
                                    />
                                    <span className="text-sm text-slate-400">
                                      tối đa {line.remaining}
                                    </span>
                                  </div>
                                )}
                                {errors.lines?.[index]?.quantity?.message && (
                                  <p className="mt-1.5 text-xs font-medium text-red-600">
                                    {errors.lines[index]?.quantity?.message}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Panel>

                <Panel title="Lý do trả hàng" icon={RotateCcw}>
                  <label className="label" htmlFor="reason">
                    Lý do
                  </label>
                  <select className="field" id="reason" {...register('reason')}>
                    <option value="">— Chọn lý do —</option>
                    {RETURN_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {RETURN_REASON_LABEL[reason]}
                      </option>
                    ))}
                  </select>
                  {errors.reason?.message && (
                    <p className="mt-1.5 text-xs font-medium text-red-600">
                      {errors.reason.message}
                    </p>
                  )}

                  <label className="label mt-4" htmlFor="note">
                    Mô tả thêm <span className="font-normal text-slate-400">(không bắt buộc)</span>
                  </label>
                  <textarea
                    className="field"
                    id="note"
                    rows={3}
                    maxLength={500}
                    placeholder="Ví dụ: màn hình bị nứt khi mở hộp"
                    {...register('note')}
                  />
                  {errors.note?.message && (
                    <p className="mt-1.5 text-xs font-medium text-red-600">{errors.note.message}</p>
                  )}
                </Panel>

                {create.isError && (
                  <Alert>
                    <p>{returnErrorMessage(create.error)}</p>
                    {failures.length > 0 && (
                      <ul className="mt-2 list-disc space-y-0.5 pl-5">
                        {failures.map((failure) => (
                          <li key={failure.orderItemId}>
                            {returnFailureMessage(failure, nameOf(failure.orderItemId))}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Alert>
                )}
              </div>

              <aside className="card p-6 lg:sticky lg:top-24">
                <h2 className="font-semibold text-slate-900">Số tiền hoàn dự kiến</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Tính theo đơn giá đã thanh toán trong đơn, không theo giá hiện tại của sản phẩm.
                </p>
                <ul className="mt-4 divide-y divide-slate-100">
                  {watchedLines
                    .filter((line) => line.selected)
                    .map((line) => (
                      <li className="flex justify-between gap-4 py-3 text-sm" key={line.orderItemId}>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-900">
                            {line.productName}
                          </span>
                          <span className="text-slate-500">
                            {formatPrice(line.unitPrice)} ×{' '}
                            {Number.isFinite(line.quantity) ? line.quantity : 0}
                          </span>
                        </span>
                        <span className="whitespace-nowrap font-semibold text-slate-900">
                          {formatPrice(
                            Number(line.unitPrice) *
                              (Number.isFinite(line.quantity) ? line.quantity : 0),
                          )}
                        </span>
                      </li>
                    ))}
                </ul>
                {!watchedLines.some((line) => line.selected) && (
                  <p className="mt-3 text-sm text-slate-400">Chưa chọn sản phẩm nào.</p>
                )}
                <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-4">
                  <span className="font-semibold text-slate-900">Tạm tính hoàn</span>
                  <span className="text-xl font-bold text-slate-900">{formatPrice(refund)}</span>
                </div>
                <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-400">
                  <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  Số tiền được chốt khi yêu cầu được tạo và không đổi về sau, kể cả khi giá sản phẩm
                  thay đổi.
                </p>
                <button className="btn-primary mt-5 w-full" disabled={create.isPending} type="submit">
                  {create.isPending ? 'Đang gửi...' : 'Gửi yêu cầu trả hàng'}
                </button>
                <Link className="btn-secondary mt-2 w-full" to={`/orders/${order.id}`}>
                  Huỷ bỏ
                </Link>
              </aside>
            </form>
          )}
        </>
      )}
    </AppShell>
  );
}