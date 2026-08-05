import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth-store';
import type { BadgeTone } from '../components/ui';
import type { OrderItem } from '../types/order';
import type {
  AdminReturnListResponse,
  AdminReturnQuery,
  CancelReturnInput,
  CreateReturnInput,
  ReturnableLine,
  ReturnLineFailure,
  ReturnListResponse,
  ReturnQuery,
  ReturnReason,
  ReturnRequest,
  ReturnStatus,
  ReturnStatusEvent,
  UpdateReturnStatusInput,
} from '../types/return';
import { apiJson } from './api-client';

const returnsKey = ['returns'] as const;
const adminReturnsKey = ['admin-returns'] as const;
const returnHistoryKey = ['return-history'] as const;

export const RETURN_PAGE_SIZE = 10;
export const ADMIN_RETURN_PAGE_SIZE = 20;

/**
 * Mirrors RETURN_WINDOW_DAYS in server/src/returns/return-rules.ts. The server
 * remains the authority — this copy exists only so the storefront can quote the
 * deadline before the customer fills in a form the API would refuse.
 */
export const RETURN_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Added in milliseconds, like the server, so DST cannot shorten a window. */
export const returnWindowEndsAt = (completedAt: string): Date =>
  new Date(new Date(completedAt).getTime() + RETURN_WINDOW_DAYS * DAY_MS);

/** Inclusive of the final instant, matching withinReturnWindow on the server. */
export const withinReturnWindow = (completedAt: string, now: Date = new Date()): boolean =>
  now.getTime() <= returnWindowEndsAt(completedAt).getTime();

/** Whole days left, floored — "còn 0 ngày" means the deadline is today. */
export const returnWindowDaysLeft = (completedAt: string, now: Date = new Date()): number =>
  Math.max(0, Math.floor((returnWindowEndsAt(completedAt).getTime() - now.getTime()) / DAY_MS));

// A readonly tuple rather than an array: z.enum() needs the literal members, and
// the filter bars need the display order.
export const RETURN_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'RECEIVED',
  'REFUNDED',
  'REJECTED',
  'CANCELLED',
] as const satisfies readonly ReturnStatus[];

export const RETURN_REASONS = [
  'DAMAGED',
  'WRONG_ITEM',
  'NOT_AS_DESCRIBED',
  'CHANGED_MIND',
  'OTHER',
] as const satisfies readonly ReturnReason[];

export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  REQUESTED: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  RECEIVED: 'Đã nhận hàng',
  REFUNDED: 'Đã hoàn tiền',
  REJECTED: 'Bị từ chối',
  CANCELLED: 'Đã huỷ',
};

/** Withdrawn by the customer reads as neutral; refused by staff does not. */
export const RETURN_STATUS_TONE: Record<ReturnStatus, BadgeTone> = {
  REQUESTED: 'amber',
  APPROVED: 'sky',
  RECEIVED: 'violet',
  REFUNDED: 'emerald',
  REJECTED: 'rose',
  CANCELLED: 'slate',
};

export const RETURN_REASON_LABEL: Record<ReturnReason, string> = {
  DAMAGED: 'Hàng bị hư hỏng',
  WRONG_ITEM: 'Giao sai sản phẩm',
  NOT_AS_DESCRIBED: 'Không đúng mô tả',
  CHANGED_MIND: 'Đổi ý, không muốn mua nữa',
  OTHER: 'Lý do khác',
};

/** Mirrors the transition map in return-rules.ts, edge for edge. */
const transitions: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['RECEIVED', 'REJECTED'],
  RECEIVED: ['REFUNDED'],
  REFUNDED: [],
  REJECTED: [],
  CANCELLED: [],
};

/**
 * What staff may actually pick. CANCELLED is a legal edge of the map because
 * the customer owns it, but `updateStatus` rejects it from an admin outright —
 * offering it would be offering a guaranteed 400.
 */
export const adminReturnTransitions = (status: ReturnStatus): ReturnStatus[] =>
  transitions[status].filter((next) => next !== 'CANCELLED');

/** Derived from the map rather than a second hand-kept list, as on the server. */
export const isTerminalReturnStatus = (status: ReturnStatus): boolean =>
  transitions[status].length === 0;

/**
 * The one transition with physical consequences: goods go back on the shelf and
 * a stock-ledger row is written. APPROVED is a promise, REFUNDED is money.
 */
export const restocksOnTransition = (next: ReturnStatus): boolean => next === 'RECEIVED';

/**
 * Mirrors claimsReturnedQuantity: only a rejection or a withdrawal hands the
 * units back to the order, letting the customer file for them again.
 */
export const claimsReturnedQuantity = (status: ReturnStatus): boolean =>
  status !== 'REJECTED' && status !== 'CANCELLED';

/**
 * Snapshot arithmetic mirroring refundTotal: `unitPrice` is what was paid, not
 * what the catalogue charges today.
 */
export const refundPreview = (
  lines: ReadonlyArray<{ unitPrice: string; quantity: number }>,
): number =>
  Math.round(
    lines.reduce((total, line) => total + Number(line.unitPrice) * line.quantity, 0) * 100,
  ) / 100;

/**
 * What each line of an order still owes the customer. Every return on an order
 * belongs to that order's owner, so the caller's own request list is the
 * complete claim picture — no other customer can be holding these units.
 */
export function returnableLines(
  items: readonly OrderItem[],
  requests: readonly ReturnRequest[],
): ReturnableLine[] {
  const claimed = new Map<string, number>();
  for (const request of requests) {
    if (!claimsReturnedQuantity(request.status)) continue;
    for (const item of request.items)
      claimed.set(item.orderItemId, (claimed.get(item.orderItemId) ?? 0) + item.quantity);
  }
  return items.map((item) => {
    const already = claimed.get(item.id) ?? 0;
    return {
      orderItemId: item.id,
      productName: item.productName,
      unitPrice: item.unitPrice,
      purchased: item.quantity,
      claimed: already,
      remaining: Math.max(0, item.quantity - already),
    };
  });
}

export const createReturn = (input: CreateReturnInput) =>
  apiJson<ReturnRequest>('/api/returns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

export function getReturns(params: {
  page: number;
  limit: number;
  status: '' | ReturnStatus;
}): Promise<ReturnListResponse> {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.status) query.set('status', params.status);
  return apiJson<ReturnListResponse>(`/api/returns?${query.toString()}`);
}

export const getReturn = (id: string) =>
  apiJson<ReturnRequest>(`/api/returns/${encodeURIComponent(id)}`);

export const getReturnHistory = (id: string) =>
  apiJson<ReturnStatusEvent[]>(`/api/returns/${encodeURIComponent(id)}/history`);

export const cancelReturn = ({ id, note }: CancelReturnInput) =>
  apiJson<ReturnRequest>(`/api/returns/${encodeURIComponent(id)}/cancel`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(note?.trim() ? { note: note.trim() } : {}),
  });

export function getAdminReturns(
  params: AdminReturnQuery & { limit: number },
): Promise<AdminReturnListResponse> {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.status) query.set('status', params.status);
  if (params.search.trim()) query.set('search', params.search.trim());
  return apiJson<AdminReturnListResponse>(`/api/admin/returns?${query.toString()}`);
}

export const updateReturnStatus = ({ id, status, note }: UpdateReturnStatusInput) =>
  apiJson<ReturnRequest>(`/api/admin/returns/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(note?.trim() ? { status, note: note.trim() } : { status }),
  });

// The API caps `limit` at 100; the page walk below is bounded so a wrong `total`
// cannot spin the browser.
const ORDER_RETURNS_LIMIT = 100;
const ORDER_RETURNS_MAX_PAGES = 20;

/**
 * Every return the caller has filed against one order. `/api/returns` has no
 * orderId filter, so the pages are walked and narrowed here — the claim maths on
 * the request form is only right if no earlier request is missing from it.
 */
export async function getReturnsForOrder(orderId: string): Promise<ReturnRequest[]> {
  const collected: ReturnRequest[] = [];
  for (let page = 1; page <= ORDER_RETURNS_MAX_PAGES; page += 1) {
    const response = await getReturns({ page, limit: ORDER_RETURNS_LIMIT, status: '' });
    collected.push(...response.items);
    if (!response.items.length || collected.length >= response.total) break;
  }
  return collected.filter((request) => request.orderId === orderId);
}

function useLoggedIn() {
  return useAuthStore((state) => Boolean(state.user && state.tokens));
}

export function useReturns(params: ReturnQuery) {
  const enabled = useLoggedIn();
  return useQuery({
    queryKey: [...returnsKey, params],
    queryFn: () => getReturns({ ...params, limit: RETURN_PAGE_SIZE }),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useReturn(id: string) {
  const enabled = useLoggedIn();
  return useQuery({
    queryKey: [...returnsKey, id],
    queryFn: () => getReturn(id),
    enabled: enabled && Boolean(id),
  });
}

export function useReturnHistory(id: string) {
  const enabled = useLoggedIn();
  return useQuery({
    queryKey: [...returnHistoryKey, id],
    queryFn: () => getReturnHistory(id),
    enabled: enabled && Boolean(id),
  });
}

/** The claims already standing against one order, for the request form. */
export function useOrderReturns(orderId: string) {
  const enabled = useLoggedIn();
  return useQuery({
    queryKey: [...returnsKey, 'for-order', orderId],
    queryFn: () => getReturnsForOrder(orderId),
    enabled: enabled && Boolean(orderId),
  });
}

export function useAdminReturns(params: AdminReturnQuery) {
  return useQuery({
    queryKey: [...adminReturnsKey, params],
    queryFn: () => getAdminReturns({ ...params, limit: ADMIN_RETURN_PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
}

function useInvalidate(keys: ReadonlyArray<readonly unknown[]>) {
  const client = useQueryClient();
  return () => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
}

// Filing or withdrawing a request changes what is still returnable on the order,
// so both list and per-order caches go together.
const customerKeys = [returnsKey, adminReturnsKey, returnHistoryKey] as const;

export function useCreateReturn() {
  const invalidate = useInvalidate(customerKeys);
  return useMutation({ mutationFn: createReturn, onSuccess: invalidate });
}

export function useCancelReturn() {
  const invalidate = useInvalidate(customerKeys);
  return useMutation({ mutationFn: cancelReturn, onSuccess: invalidate });
}

/**
 * A lifecycle move can restock (RECEIVED) and always rewrites the timeline, so
 * the product listings, the stock ledger and the dashboard totals go stale with
 * it — not just the queue.
 */
export function useUpdateReturnStatus() {
  const invalidate = useInvalidate([
    adminReturnsKey,
    returnsKey,
    returnHistoryKey,
    ['products'],
    ['product'],
    ['stock-movements'],
    ['admin-stats'],
  ]);
  return useMutation({ mutationFn: updateReturnStatus, onSuccess: invalidate });
}

export function returnErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Không thể xử lý yêu cầu trả hàng.';
  try {
    const body = JSON.parse(error.message) as { message?: string | string[] };
    return Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message ?? 'Không thể xử lý yêu cầu trả hàng.';
  } catch {
    return error.message;
  }
}

/**
 * The lines a 400 or 409 refused, each with its reason. Same structured body as
 * the checkout conflict: `{ message, items: [...] }`. `reason` falls back to
 * `exceeds-remaining` because that is the recoverable case — the customer only
 * has to ask for fewer units.
 */
export function returnLineFailures(error: unknown): ReturnLineFailure[] {
  if (!(error instanceof Error)) return [];
  try {
    const body = JSON.parse(error.message) as { items?: Array<Partial<ReturnLineFailure>> };
    return (body.items ?? []).map((item) => ({
      orderItemId: item.orderItemId ?? '',
      requested: item.requested ?? 0,
      remaining: item.remaining ?? 0,
      reason: item.reason === 'not-in-order' ? 'not-in-order' : 'exceeds-remaining',
    }));
  } catch {
    return [];
  }
}

/**
 * "Not on this order" and "already spoken for" send the customer somewhere
 * different: one is a stale page, the other only needs a smaller number.
 */
export function returnFailureMessage(failure: ReturnLineFailure, productName: string): string {
  const name = productName || 'Sản phẩm';
  return failure.reason === 'not-in-order'
    ? `${name}: dòng hàng này không thuộc đơn hàng, vui lòng tải lại trang.`
    : `${name}: bạn yêu cầu trả ${failure.requested}, chỉ còn ${failure.remaining} có thể trả.`;
}
