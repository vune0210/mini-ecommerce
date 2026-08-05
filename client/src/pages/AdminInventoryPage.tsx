import {
  ArrowDownUp,
  Boxes,
  ClipboardList,
  ExternalLink,
  PackagePlus,
  SlidersHorizontal,
  TriangleAlert,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminShell } from '../components/AdminShell';
import { DateRangeFilter } from '../components/admin/DateRangeFilter';
import {
  Alert,
  Badge,
  EmptyState,
  PageHeader,
  Pagination,
  Panel,
  Skeleton,
  type BadgeTone,
} from '../components/ui';
import {
  INVENTORY_PRODUCT_LIMIT,
  inventoryError,
  STOCK_MOVEMENT_PAGE_SIZE,
  useAdjustStock,
  useInventoryProducts,
  useStockMovements,
} from '../lib/inventory-api';
import { formatDateTime } from '../lib/format';
import type { StatsQuery } from '../types/admin';
import type { Product } from '../types/catalog';
import type { ManualStockReason, StockMovementReason } from '../types/inventory';

const REASONS: StockMovementReason[] = ['SALE', 'CANCELLATION', 'ADJUSTMENT', 'RESTOCK'];

const REASON_LABEL: Record<StockMovementReason, string> = {
  SALE: 'Bán hàng',
  CANCELLATION: 'Huỷ đơn',
  ADJUSTMENT: 'Kiểm kê',
  RESTOCK: 'Nhập kho',
};

const REASON_TONE: Record<StockMovementReason, BadgeTone> = {
  SALE: 'rose',
  CANCELLATION: 'sky',
  ADJUSTMENT: 'amber',
  RESTOCK: 'emerald',
};

const MANUAL_REASONS: ManualStockReason[] = ['ADJUSTMENT', 'RESTOCK'];

const THRESHOLDS = [5, 10, 20, 50];

/** Signed and coloured: a row must read as "gained" or "lost" at a glance. */
function Delta({ value }: { value: number }) {
  const positive = value > 0;
  return (
    <span
      className={`font-semibold tabular-nums ${positive ? 'text-emerald-600' : 'text-rose-600'}`}
    >
      {positive ? `+${value}` : value}
    </span>
  );
}

function stockTone(stock: number): BadgeTone {
  if (stock === 0) return 'rose';
  if (stock <= 5) return 'amber';
  return 'slate';
}

export function AdminInventoryPage() {
  const [productId, setProductId] = useState('');
  const [reason, setReason] = useState<'' | StockMovementReason>('');
  const [range, setRange] = useState<StatsQuery>({});
  const [page, setPage] = useState(1);
  const [threshold, setThreshold] = useState(5);
  const [adjusting, setAdjusting] = useState<Product | null>(null);

  const movements = useStockMovements({ page, productId, reason, from: range.from, to: range.to });
  const products = useInventoryProducts();

  const totalPages = movements.data
    ? Math.max(1, Math.ceil(movements.data.total / STOCK_MOVEMENT_PAGE_SIZE))
    : 1;

  const lowStock = useMemo(
    () =>
      (products.data?.items ?? [])
        .filter((product) => product.stock <= threshold)
        .sort((a, b) => a.stock - b.stock),
    [products.data, threshold],
  );

  // The API caps `limit` at 100, so a bigger catalogue is only partly covered
  // here. Say so rather than let the panel look exhaustive when it is not.
  const truncated = (products.data?.total ?? 0) > (products.data?.items.length ?? 0);

  function changeFilter(apply: () => void): void {
    apply();
    setPage(1);
  }

  return (
    <AdminShell>
      <PageHeader
        title="Kho hàng"
        description="Sổ cái tồn kho: mọi thay đổi đều được ghi lại kèm số dư sau thay đổi. Lưu ý: PATCH /api/products/:id vẫn ghi thẳng được trường stock, nhưng chỉ đường dẫn điều chỉnh ở trang này (PATCH /api/products/:id/stock) mới để lại dấu vết kiểm toán."
        action={movements.data && <Badge tone="slate">{movements.data.total} biến động</Badge>}
      />

      <Panel
        className="mb-6"
        title="Cần nhập thêm"
        icon={TriangleAlert}
        action={
          <select
            className="field w-auto py-1.5 text-xs"
            value={threshold}
            onChange={(event) => setThreshold(Number(event.target.value))}
            aria-label="Ngưỡng cảnh báo tồn kho"
          >
            {THRESHOLDS.map((value) => (
              <option key={value} value={value}>
                Còn ≤ {value}
              </option>
            ))}
          </select>
        }
        bare
      >
        {products.isPending ? (
          <div className="p-5">
            <Skeleton className="h-24" />
          </div>
        ) : products.isError ? (
          <div className="p-5">
            <Alert>Không thể tải danh sách sản phẩm.</Alert>
          </div>
        ) : lowStock.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            Không có sản phẩm nào còn dưới {threshold} đơn vị.
          </p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {lowStock.map((product) => (
              <li
                className="flex flex-wrap items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50/60"
                key={product.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{product.name}</p>
                  <p className="text-xs text-slate-400">
                    {product.sku ?? 'Chưa có SKU'}
                    {!product.isActive && ' · Chưa xuất bản'}
                  </p>
                </div>
                <Badge tone={stockTone(product.stock)}>Còn {product.stock}</Badge>
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => changeFilter(() => setProductId(product.id))}
                >
                  <ClipboardList className="h-3.5 w-3.5" aria-hidden />
                  Lịch sử
                </button>
                <button className="btn-secondary btn-sm" onClick={() => setAdjusting(product)}>
                  <PackagePlus className="h-3.5 w-3.5" aria-hidden />
                  Cập nhật kho
                </button>
              </li>
            ))}
          </ul>
        )}
        {truncated && (
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
            Chỉ xét {INVENTORY_PRODUCT_LIMIT} sản phẩm đầu tiên trên tổng số{' '}
            {products.data?.total} (giới hạn của API).
          </p>
        )}
      </Panel>

      <Panel className="mb-6" title="Bộ lọc sổ cái" icon={SlidersHorizontal}>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="inventory-product">
              Sản phẩm
            </label>
            <select
              className="field"
              id="inventory-product"
              value={productId}
              disabled={products.isPending}
              onChange={(event) => changeFilter(() => setProductId(event.target.value))}
            >
              <option value="">Tất cả sản phẩm</option>
              {products.data?.items.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} (còn {product.stock})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="inventory-reason">
              Lý do
            </label>
            <select
              className="field"
              id="inventory-reason"
              value={reason}
              onChange={(event) =>
                changeFilter(() => setReason(event.target.value as '' | StockMovementReason))
              }
            >
              <option value="">Tất cả lý do</option>
              {REASONS.map((value) => (
                <option key={value} value={value}>
                  {REASON_LABEL[value]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {/* Same component the dashboard uses, so both pages slice time identically. */}
        <DateRangeFilter value={range} onChange={(next) => changeFilter(() => setRange(next))} />
        <div className="-mt-2 flex flex-wrap items-center gap-3">
          <button
            className="btn-secondary btn-sm"
            onClick={() =>
              setAdjusting(
                products.data?.items.find((item) => item.id === productId) ??
                  products.data?.items[0] ??
                  null,
              )
            }
            disabled={!products.data?.items.length}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            Điều chỉnh tồn kho
          </button>
          <p className="text-xs text-slate-400">
            Khoảng ngày tính theo ngày lịch UTC, giống trang thống kê.
          </p>
        </div>
      </Panel>

      {movements.isPending ? (
        <Skeleton className="h-64" />
      ) : movements.isError ? (
        <Alert>Không thể tải sổ cái kho.</Alert>
      ) : !movements.data.items.length ? (
        <EmptyState
          icon={Boxes}
          title="Chưa có biến động kho nào khớp bộ lọc"
          description="Thử bỏ bớt bộ lọc, hoặc mở rộng khoảng thời gian."
        />
      ) : (
        <>
          <Panel bare>
            <div
              className={`overflow-x-auto transition-opacity ${movements.isFetching ? 'opacity-60' : ''}`}
            >
              {/* Eight columns will not fit a laptop viewport; scroll instead of crushing them. */}
              <table className="w-full min-w-[1040px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-3 font-semibold">Thời điểm</th>
                    <th className="px-5 py-3 font-semibold">Sản phẩm</th>
                    <th className="px-5 py-3 font-semibold">Lý do</th>
                    <th className="px-5 py-3 text-right font-semibold">Thay đổi</th>
                    <th className="px-5 py-3 text-right font-semibold">Còn lại</th>
                    <th className="px-5 py-3 font-semibold">Đơn hàng</th>
                    <th className="px-5 py-3 font-semibold">Người thực hiện</th>
                    <th className="px-5 py-3 font-semibold">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {movements.data.items.map((movement) => (
                    <tr className="transition-colors hover:bg-slate-50/60" key={movement.id}>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-500">
                        {formatDateTime(movement.createdAt)}
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">{movement.productName}</p>
                        {/* The snapshot outlives the product; say so instead of showing a dead link. */}
                        {!movement.productId && (
                          <p className="text-xs text-slate-400">Sản phẩm đã bị xoá</p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={REASON_TONE[movement.reason]}>
                          {REASON_LABEL[movement.reason]}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Delta value={movement.delta} />
                      </td>
                      <td className="px-5 py-3 text-right font-medium tabular-nums text-slate-900">
                        {movement.balanceAfter}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        {movement.orderId ? (
                          <Link
                            className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline"
                            to={`/admin/orders/${movement.orderId}`}
                          >
                            Xem đơn
                            <ExternalLink className="h-3 w-3" aria-hidden />
                          </Link>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        {movement.actorUser ? (
                          <>
                            <p className="text-slate-700">{movement.actorUser.name}</p>
                            <p className="text-xs text-slate-400">{movement.actorUser.email}</p>
                          </>
                        ) : (
                          <span className="text-slate-400">Hệ thống</span>
                        )}
                      </td>
                      <td className="max-w-[240px] px-5 py-3 text-slate-500">
                        {movement.note ?? <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={setPage}
            summary={`${movements.data.total} biến động`}
          />
        </>
      )}

      {adjusting && (
        <StockAdjustDialog
          product={adjusting}
          products={products.data?.items ?? []}
          onPick={setAdjusting}
          onClose={() => setAdjusting(null)}
        />
      )}
    </AdminShell>
  );
}

type DialogProps = {
  product: Product;
  products: Product[];
  onPick: (product: Product) => void;
  onClose: () => void;
};

/**
 * The field is the level the product ends at, not an amount to add. The current
 * level and a live "thay đổi" preview sit next to the input so the absolute
 * semantics cannot be misread — the API is absolute so a retried request
 * converges instead of counting twice.
 */
function StockAdjustDialog({ product, products, onPick, onClose }: DialogProps) {
  const [stock, setStock] = useState(String(product.stock));
  const [reason, setReason] = useState<ManualStockReason>('ADJUSTMENT');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const adjust = useAdjustStock();

  // Switching product inside the dialog must re-seed the field, or the admin
  // would be writing one product's count onto another.
  useEffect(() => {
    setStock(String(product.stock));
    setError(null);
  }, [product]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const next = Number(stock);
  const valid = stock.trim() !== '' && Number.isInteger(next) && next >= 0;
  const delta = valid ? next - product.stock : 0;

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (!valid) {
      setError('Tồn kho mới phải là số nguyên lớn hơn hoặc bằng 0.');
      return;
    }
    setError(null);
    adjust.mutate(
      { id: product.id, stock: next, reason, note },
      { onSuccess: onClose, onError: (cause) => setError(inventoryError(cause)) },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <form
        className="card w-full max-w-lg p-6"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-dialog-title"
      >
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2
              className="flex items-center gap-2 text-lg font-semibold text-slate-900"
              id="stock-dialog-title"
            >
              <ArrowDownUp className="h-4 w-4 text-slate-400" aria-hidden />
              Điều chỉnh tồn kho
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Ghi vào sổ cái kèm người thực hiện. Đây là cách duy nhất để lại dấu vết kiểm toán.
            </p>
          </div>
          <button className="btn-ghost btn-sm" type="button" onClick={onClose} aria-label="Đóng">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="grid gap-4">
          <div>
            <label className="label" htmlFor="adjust-product">
              Sản phẩm
            </label>
            <select
              className="field"
              id="adjust-product"
              value={product.id}
              onChange={(event) => {
                const picked = products.find((item) => item.id === event.target.value);
                if (picked) onPick(picked);
              }}
            >
              {products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Tồn kho hiện tại</span>
              <span className="font-semibold tabular-nums text-slate-900">{product.stock}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-sm">
              <span className="text-slate-500">Chênh lệch sẽ ghi vào sổ</span>
              {valid ? (
                delta === 0 ? (
                  <span className="text-slate-400">Không thay đổi</span>
                ) : (
                  <Delta value={delta} />
                )
              ) : (
                <span className="text-slate-300">—</span>
              )}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="adjust-stock">
              Tồn kho SAU điều chỉnh
            </label>
            <input
              className="field"
              id="adjust-stock"
              type="number"
              min="0"
              step="1"
              value={stock}
              onChange={(event) => setStock(event.target.value)}
              aria-describedby="adjust-stock-help"
            />
            <p className="mt-1.5 text-xs text-slate-500" id="adjust-stock-help">
              Nhập số lượng cuối cùng sản phẩm sẽ có, <strong>không phải</strong> số lượng cộng
              thêm. Ví dụ: đang còn {product.stock}, nhập vào {product.stock + 10} nghĩa là nhập
              thêm 10. Gửi lại đúng giá trị này lần nữa sẽ không cộng dồn.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="adjust-reason">
              Lý do
            </label>
            <select
              className="field"
              id="adjust-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value as ManualStockReason)}
            >
              {MANUAL_REASONS.map((value) => (
                <option key={value} value={value}>
                  {REASON_LABEL[value]}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">
              Bán hàng và huỷ đơn do hệ thống tự ghi; ở đây chỉ chọn được kiểm kê hoặc nhập kho.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="adjust-note">
              Ghi chú <span className="font-normal text-slate-400">(không bắt buộc, tối đa 500 ký tự)</span>
            </label>
            <textarea
              className="field"
              id="adjust-note"
              rows={2}
              maxLength={500}
              placeholder="Kiểm kê kho tháng 7, lệch 2 cái"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          {error && <Alert>{error}</Alert>}

          <div className="flex justify-end gap-2">
            <button className="btn-secondary" type="button" onClick={onClose}>
              Huỷ
            </button>
            <button className="btn-primary" disabled={adjust.isPending || !valid}>
              {adjust.isPending ? 'Đang lưu...' : 'Ghi vào sổ cái'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
