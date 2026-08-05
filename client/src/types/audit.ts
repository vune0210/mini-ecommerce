/**
 * Mirrors `server/src/audit/entities/audit-log.entity.ts`. The table is
 * append-only: the API exposes two GETs and nothing that edits or removes a
 * row, so nothing here is ever written from the client.
 */

/**
 * The joined `users` row, present only while the account still exists. Narrower
 * than the server entity on purpose — the page reads the name, and the email
 * and role come from the snapshots so they survive the account being deleted.
 */
export type AuditActor = { id: string; email: string; name: string };

export type AuditLogEntry = {
  id: string;
  /** Null once the staff account is deleted — the FK is ON DELETE SET NULL. */
  actorUserId: string | null;
  actorUser: AuditActor | null;
  /** Snapshot taken at write time; readable after the account is gone. */
  actorEmail: string;
  /** Snapshot of the role held then, not the role held today. */
  actorRole: string;
  /** Route-derived, e.g. `product.update`, `user.role.change`. */
  action: string;
  method: string;
  path: string;
  resourceType: string | null;
  resourceId: string | null;
  statusCode: number;
  /** Correlates the row with the access-log line for the same request. */
  requestId: string | null;
  /** An allow-listed handful of scalars from the request body — never the body. */
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
};

export type AuditLogListResponse = {
  items: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
};

/** Distinct actions actually present in the table, so a UI filter cannot drift. */
export type AuditActionsResponse = { actions: string[] };

/** `from`/`to` are UTC calendar days (`2026-07-01`), matching the stats range. */
export type AuditLogQuery = {
  page: number;
  /** Must be a user id — the API validates it as a UUID, not as an email. */
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  from?: string;
  to?: string;
};

/**
 * The actor the table is filtered to. The email travels with the id because a
 * row's actor may have been demoted or deleted and so is absent from the
 * admin list the select is built from — without it the chip would be blank.
 */
export type AuditActorFilter = { id: string; email: string };
