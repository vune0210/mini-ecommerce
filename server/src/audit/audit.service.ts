import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  reportingRange,
  REPORTING_TIMEZONE,
} from '../stats/stats-calculations';
import { ListAuditLogDto } from './dto/list-audit-log.dto';
import { AuditLog } from './entities/audit-log.entity';

export type PaginatedAuditLog = {
  items: AuditLog[];
  total: number;
  page: number;
  limit: number;
};

export type AuditDraft = {
  actorUserId: string | null;
  actorEmail: string;
  actorRole: string;
  action: string;
  method: string;
  path: string;
  resourceType: string | null;
  resourceId: string | null;
  statusCode: number;
  requestId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
};

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly entries: Repository<AuditLog>,
  ) {}

  /**
   * Deliberately outside any caller transaction. The audit row describes a
   * request that already succeeded, so tying it to the handler's transaction
   * would mean a late rollback erases the record of work that was in fact done
   * — and, worse, a failing insert here would roll back the admin's change.
   */
  async record(draft: AuditDraft): Promise<void> {
    await this.entries.save(this.entries.create(draft));
  }

  async findAll(query: ListAuditLogDto): Promise<PaginatedAuditLog> {
    const range = reportingRange(query.from, query.to, REPORTING_TIMEZONE);
    if (!range.valid) throw new BadRequestException(range.error);

    const builder = this.entries
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.actorUser', 'actor');
    if (query.actorUserId)
      builder.andWhere('entry.actor_user_id = :actorUserId', {
        actorUserId: query.actorUserId,
      });
    if (query.action)
      builder.andWhere('entry.action = :action', { action: query.action });
    if (query.resourceType)
      builder.andWhere('entry.resource_type = :resourceType', {
        resourceType: query.resourceType,
      });
    if (query.resourceId)
      builder.andWhere('entry.resource_id = :resourceId', {
        resourceId: query.resourceId,
      });
    // Half-open bounds, same convention the stats and ledger ranges use.
    if (range.fromBound)
      builder.andWhere('entry.created_at >= :fromBound', {
        fromBound: range.fromBound,
      });
    if (range.toBound)
      builder.andWhere('entry.created_at < :toBound', {
        toBound: range.toBound,
      });

    const total = await builder.getCount();
    const items = await builder
      .orderBy('entry.createdAt', 'DESC')
      .addOrderBy('entry.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();
    return { items, total, page: query.page, limit: query.limit };
  }

  /**
   * Action names are derived from routes, so the set grows as endpoints are
   * added. Reading it from the data keeps a UI filter honest instead of
   * hard-coding a list that silently goes stale.
   */
  async distinctActions(): Promise<string[]> {
    const rows = await this.entries
      .createQueryBuilder('entry')
      .select('entry.action', 'action')
      .distinct(true)
      .orderBy('entry.action', 'ASC')
      .getRawMany<{ action: string }>();
    return rows.map((row) => row.action);
  }
}
