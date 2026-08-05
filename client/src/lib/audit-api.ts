import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminUserListResponse } from '../types/admin';
import type {
  AuditActionsResponse,
  AuditLogListResponse,
  AuditLogQuery,
} from '../types/audit';
import { apiJson } from './api-client';

// One prefix for the whole feature: the list, the action names and the actor
// list all go stale together when a refresh is asked for.
const auditLogKey = ['audit-log'] as const;

export const AUDIT_LOG_PAGE_SIZE = 20;
/** The users API caps `limit` at 100; the actor select shares that one page. */
export const AUDIT_ACTOR_LIMIT = 100;

export function getAuditLog(
  params: AuditLogQuery & { limit: number },
): Promise<AuditLogListResponse> {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.actorUserId) query.set('actorUserId', params.actorUserId);
  if (params.action) query.set('action', params.action);
  if (params.resourceType) query.set('resourceType', params.resourceType);
  if (params.resourceId.trim()) query.set('resourceId', params.resourceId.trim());
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  return apiJson<AuditLogListResponse>(`/api/admin/audit-log?${query.toString()}`);
}

/**
 * The action names actually present in the table. Read from the data rather
 * than hard-coded here: actions are derived from routes on the server, so a
 * list written by hand goes stale the day an endpoint is added.
 */
export const getAuditActions = () =>
  apiJson<AuditActionsResponse>('/api/admin/audit-log/actions');

/**
 * Names the actor filter. Only accounts that hold ADMIN *today* — an admin who
 * was since demoted or deleted still has rows, which is why the page also lets
 * a row set the filter directly from its own `actorUserId`.
 */
export function getAuditActors(): Promise<AdminUserListResponse> {
  const query = new URLSearchParams({
    page: '1',
    limit: String(AUDIT_ACTOR_LIMIT),
    role: 'ADMIN',
  });
  return apiJson<AdminUserListResponse>(`/api/admin/users?${query.toString()}`);
}

function useInvalidate(keys: ReadonlyArray<readonly unknown[]>) { const client = useQueryClient(); return () => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey }))); }

/** placeholderData keeps the previous page on screen while a filter change loads. */
export function useAuditLog(params: AuditLogQuery) { return useQuery({ queryKey: [...auditLogKey, params], queryFn: () => getAuditLog({ ...params, limit: AUDIT_LOG_PAGE_SIZE }), placeholderData: keepPreviousData }); }
export function useAuditActions() { return useQuery({ queryKey: [...auditLogKey, 'actions'], queryFn: getAuditActions }); }
export function useAuditActors() { return useQuery({ queryKey: [...auditLogKey, 'actors'], queryFn: getAuditActors }); }
/**
 * The trail grows from other people's requests, never from this page — there is
 * no mutation to hang an invalidation off, so the refresh is explicit.
 */
export function useRefreshAuditLog() { return useInvalidate([auditLogKey]); }

export function auditError(error: unknown): string { if (!(error instanceof Error)) return 'Không thể tải nhật ký.'; try { const body = JSON.parse(error.message) as { message?: string | string[] }; return Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Không thể tải nhật ký.'; } catch { return error.message; } }
