import { ArrowLeft, Clock3, PackageOpen, XCircle } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Alert, Badge, EmptyState, PageHeader, Panel, SkeletonList } from '../components/ui';
import { formatDateTime, formatPrice } from '../lib/format';
import {
  RETURN_REASON_LABEL,
  RETURN_STATUS_LABEL,
  RETURN_STATUS_TONE,
  returnErrorMessage,
  useCancelReturn,
  useReturn,
  useReturnHistory,
} from '../lib/return-api';

export function ReturnDetailPage() {
  const { id = '' } = useParams();
  const request = useReturn(id);
  const history = useReturnHistory(id);
  const cancel = useCancelReturn();

  if (request.isPending)
    return <AppShell width="lg"><SkeletonList count={4} /></AppShell>;
  if (request.isError || !request.data)
    return (
      <AppShell width="md">
        <EmptyState icon={PackageOpen} title="Không tìm thấy yêu cầu trả hàng" description="Yêu cầu không tồn tại hoặc bạn không có quyền xem." action={<Link className="btn-primary" to="/returns">Quay lại danh sách</Link>} />
      </AppShell>
    );

  const row = request.data;
  return (
    <AppShell width="lg">
      <Link className="btn-ghost btn-sm -ml-3 mb-4" to="/returns"><ArrowLeft className="h-4 w-4" />Danh sách trả hàng</Link>
      <PageHeader
        eyebrow="Trả hàng"
        title={row.requestNumber}
        description={`Tạo lúc ${formatDateTime(row.createdAt)}${row.order ? ` · đơn ${row.order.orderNumber}` : ''}`}
        action={<Badge tone={RETURN_STATUS_TONE[row.status]}>{RETURN_STATUS_LABEL[row.status]}</Badge>}
      />
      {cancel.isError && <Alert className="mb-4">{returnErrorMessage(cancel.error)}</Alert>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Panel title="Sản phẩm yêu cầu trả" icon={PackageOpen}>
            <ul className="divide-y divide-slate-100">
              {row.items.map((item) => (
                <li className="flex justify-between gap-4 py-3 first:pt-0 last:pb-0" key={item.id}>
                  <div><p className="font-medium text-slate-900">{item.productName}</p><p className="text-sm text-slate-500">{formatPrice(item.unitPrice)} × {item.quantity}</p></div>
                  <p className="font-semibold text-slate-900">{formatPrice(item.subtotal)}</p>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Thông tin yêu cầu">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div><dt className="text-sm text-slate-500">Lý do</dt><dd className="mt-1 font-medium">{RETURN_REASON_LABEL[row.reason]}</dd></div>
              <div><dt className="text-sm text-slate-500">Số tiền dự kiến hoàn</dt><dd className="mt-1 font-bold">{formatPrice(row.refundAmount)}</dd></div>
              {row.note && <div className="sm:col-span-2"><dt className="text-sm text-slate-500">Ghi chú</dt><dd className="mt-1 whitespace-pre-wrap">{row.note}</dd></div>}
            </dl>
          </Panel>
        </div>
        <Panel title="Tiến trình xử lý" icon={Clock3}>
          {history.isPending ? <SkeletonList count={3} /> : history.isError ? <Alert>Không thể tải lịch sử.</Alert> : (
            <ol className="space-y-4">
              {(history.data ?? []).map((event, index) => (
                <li className="relative border-l-2 border-slate-200 pl-4" key={`${event.createdAt}-${index}`}>
                  <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-brand-600" />
                  <p className="font-medium text-slate-900">{RETURN_STATUS_LABEL[event.toStatus]}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(event.createdAt)}{event.actorName ? ` · ${event.actorName}` : ''}</p>
                  {event.note && <p className="mt-1 text-sm text-slate-600">{event.note}</p>}
                </li>
              ))}
            </ol>
          )}
          {row.status === 'REQUESTED' && <button className="btn-secondary mt-6 w-full text-red-600" disabled={cancel.isPending} onClick={() => cancel.mutate({ id: row.id })}><XCircle className="h-4 w-4" />{cancel.isPending ? 'Đang huỷ…' : 'Huỷ yêu cầu'}</button>}
        </Panel>
      </div>
    </AppShell>
  );
}
