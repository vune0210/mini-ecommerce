import { RefreshCw, RotateCcw, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AdminShell } from '../components/AdminShell';
import { Alert, Badge, EmptyState, PageHeader, Pagination, Panel, SkeletonList } from '../components/ui';
import { formatDateTime, formatPrice } from '../lib/format';
import {
  ADMIN_RETURN_PAGE_SIZE,
  RETURN_REASON_LABEL,
  RETURN_STATUS_LABEL,
  RETURN_STATUS_TONE,
  RETURN_STATUSES,
  adminReturnTransitions,
  restocksOnTransition,
  returnErrorMessage,
  useAdminReturns,
  useUpdateReturnStatus,
} from '../lib/return-api';
import type { ReturnStatus } from '../types/return';

export function AdminReturnsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'' | ReturnStatus>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const rows = useAdminReturns({ page, status, search });
  const update = useUpdateReturnStatus();
  useEffect(() => { const timer = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 350); return () => window.clearTimeout(timer); }, [searchInput]);
  const totalPages = rows.data ? Math.max(1, Math.ceil(rows.data.total / ADMIN_RETURN_PAGE_SIZE)) : 1;

  function transition(id: string, next: ReturnStatus): void {
    const warning = restocksOnTransition(next) ? 'Thao tác này sẽ hoàn kho cho các sản phẩm đã nhận. Tiếp tục?' : `Chuyển yêu cầu sang “${RETURN_STATUS_LABEL[next]}”?`;
    if (!window.confirm(warning)) return;
    const note = window.prompt('Ghi chú xử lý (không bắt buộc):') ?? undefined;
    update.mutate({ id, status: next, note });
  }

  return (
    <AdminShell>
      <PageHeader title="Yêu cầu trả hàng" description="Duyệt, nhận lại hàng và xác nhận hoàn tiền cho khách." action={<button className="btn-secondary" onClick={() => void rows.refetch()}><RefreshCw className="h-4 w-4" />Làm mới</button>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className="field pl-9" placeholder="Mã yêu cầu, mã đơn, email…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} /></label>
        <select className="field" value={status} onChange={(e) => { setStatus(e.target.value as '' | ReturnStatus); setPage(1); }}><option value="">Mọi trạng thái</option>{RETURN_STATUSES.map((value) => <option value={value} key={value}>{RETURN_STATUS_LABEL[value]}</option>)}</select>
      </div>
      {update.isError && <Alert className="mb-4">{returnErrorMessage(update.error)}</Alert>}
      {rows.isPending ? <SkeletonList count={5} /> : rows.isError ? <Alert>Không thể tải hàng đợi trả hàng.</Alert> : !rows.data?.items.length ? <EmptyState icon={RotateCcw} title="Không có yêu cầu phù hợp" description="Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm." /> : (
        <div className="space-y-4">
          {rows.data.items.map((row) => (
            <Panel key={row.id} title={row.requestNumber} action={<Badge tone={RETURN_STATUS_TONE[row.status]}>{RETURN_STATUS_LABEL[row.status]}</Badge>}>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div>
                  <p className="text-sm text-slate-500">{row.user?.name ?? 'Khách hàng'} · {row.user?.email ?? 'Không có email'} · {formatDateTime(row.createdAt)}</p>
                  <p className="mt-2 font-medium">{RETURN_REASON_LABEL[row.reason]} · hoàn {formatPrice(row.refundAmount)}</p>
                  <ul className="mt-2 text-sm text-slate-600">{row.items.map((item) => <li key={item.id}>{item.productName} × {item.quantity}</li>)}</ul>
                  {row.note && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm">{row.note}</p>}
                </div>
                <div className="space-y-2">
                  {adminReturnTransitions(row.status).map((next) => <button className="btn-secondary w-full" disabled={update.isPending} onClick={() => transition(row.id, next)} key={next}>{RETURN_STATUS_LABEL[next]}</button>)}
                  {!adminReturnTransitions(row.status).length && <p className="text-center text-sm text-slate-500">Đã kết thúc xử lý</p>}
                </div>
              </div>
            </Panel>
          ))}
          <Pagination page={page} totalPages={totalPages} onChange={setPage} summary={`${rows.data.total} yêu cầu`} />
        </div>
      )}
    </AdminShell>
  );
}
