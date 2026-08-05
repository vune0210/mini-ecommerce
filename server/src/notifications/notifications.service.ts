import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EntityManager,
  In,
  IsNull,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { NotificationPreference } from './entities/notification-preference.entity';
import { Notification } from './entities/notification.entity';
import {
  buildNotificationRow,
  isMuted,
  NotificationDraft,
  NotificationPreferences,
  PublicNotification,
  serializeNotification,
  serializePreferences,
  shouldRethrowEmitFailure,
} from './notification-rules';

export type { NotificationDraft } from './notification-rules';

export type PaginatedNotifications = {
  items: PublicNotification[];
  total: number;
  page: number;
  limit: number;
  /**
   * Returned alongside the page so the nav badge and the list can never
   * disagree — the SPA marks something read and gets the new count back from
   * the same request rather than racing a second one.
   */
  unreadCount: number;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectRepository(NotificationPreference)
    private readonly preferences: Repository<NotificationPreference>,
  ) {}

  /**
   * The emit entry point other modules call.
   *
   * `manager` is optional but rarely should be null. Passing the caller's
   * EntityManager makes the notification commit or roll back with the event it
   * describes — the same reason `StockMovementsService.record` insists on one.
   * "Your order was placed" surviving a checkout that rolled back is worse than
   * no notification at all: the customer is told about an order that does not
   * exist, and goes looking for it in an empty order list.
   *
   * Pass null only when there is no surrounding transaction to join — a cron
   * sweep for expiring coupons, say — and the notification is the whole event.
   *
   * Never throws for infrastructure trouble; see `shouldRethrowEmitFailure` for
   * exactly which failures still propagate and why those two must.
   */
  async notify(
    manager: EntityManager | null,
    draft: NotificationDraft,
  ): Promise<void> {
    await this.notifyMany(manager, [draft]);
  }

  /** Same contract as `notify`, one round trip for a batch of recipients. */
  async notifyMany(
    manager: EntityManager | null,
    drafts: NotificationDraft[],
  ): Promise<void> {
    if (!drafts.length) return;
    // Checked before the try, so it cannot be swallowed as infrastructure
    // trouble. A draft with no recipient can only come from a caller that lied
    // to the type system; it would fail on the foreign key and look like a
    // flaky database instead of the bug it is.
    for (const draft of drafts)
      if (!draft.userId)
        throw new TypeError('Notification draft is missing a userId');

    try {
      const repository =
        manager?.getRepository(Notification) ?? this.notifications;
      const preferenceRepository =
        manager?.getRepository(NotificationPreference) ?? this.preferences;
      // Read through the caller's manager too. Reaching for a second pooled
      // connection while the caller holds a transaction open is how a busy
      // checkout ends up queueing behind its own pool.
      const userIds = [...new Set(drafts.map((draft) => draft.userId))];
      const rows = await preferenceRepository.findBy({ userId: In(userIds) });
      const byUser = new Map(
        rows.map((row) => [row.userId, serializePreferences(row)]),
      );

      const pending = drafts
        .filter(
          (draft) => !isMuted(draft.type, byUser.get(draft.userId) ?? null),
        )
        .map((draft) => repository.create(buildNotificationRow(draft)));
      if (!pending.length) return;
      await repository.save(pending);
    } catch (error) {
      if (shouldRethrowEmitFailure(error, manager !== null)) throw error;
      // Deliberately warn-and-continue: the caller is mid-checkout, and a
      // notifications table that is down must not cost a customer their order.
      this.logger.warn({
        message: 'Failed to emit notifications; business operation continues',
        types: [...new Set(drafts.map((draft) => draft.type))],
        recipients: [...new Set(drafts.map((draft) => draft.userId))].length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Newest first, with the id tiebreak that keeps pages stable across inserts. */
  async findAll(
    userId: string,
    query: ListNotificationsDto,
  ): Promise<PaginatedNotifications> {
    const builder = this.notifications
      .createQueryBuilder('notification')
      .where('notification.user_id = :userId', { userId });
    if (query.unreadOnly) builder.andWhere('notification.read_at IS NULL');
    if (query.type)
      builder.andWhere('notification.type = :type', { type: query.type });

    const total = await builder.getCount();
    const items = await builder
      .orderBy('notification.createdAt', 'DESC')
      .addOrderBy('notification.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();
    return {
      items: items.map((item) => serializeNotification(item)),
      total,
      page: query.page,
      limit: query.limit,
      unreadCount: await this.unreadCount(userId),
    };
  }

  /**
   * Served entirely by IDX_notifications_user_read_at, so the badge stays cheap
   * enough for the SPA to poll it on every page.
   */
  unreadCount(userId: string): Promise<number> {
    return this.notifications.countBy({ userId, readAt: IsNull() });
  }

  /**
   * Idempotent. A second call keeps the original timestamp: `read_at` records
   * when the customer first saw it, and re-opening the inbox does not change
   * that. Scoped by user id rather than fetched-then-checked, so a 404 for
   * someone else's notification leaks nothing about whether that id exists.
   */
  async markRead(userId: string, id: string): Promise<PublicNotification> {
    const notification = await this.notifications.findOneBy({ id, userId });
    if (!notification) throw new NotFoundException('Notification not found');
    if (!notification.readAt) {
      notification.readAt = new Date();
      await this.notifications.save(notification);
    }
    return serializeNotification(notification);
  }

  /** One UPDATE over the unread rows; returns the new (zero) unread count. */
  async markAllRead(
    userId: string,
  ): Promise<{ updated: number; unreadCount: number }> {
    const result = await this.notifications.update(
      { userId, readAt: IsNull() },
      { readAt: new Date() },
    );
    return { updated: result.affected ?? 0, unreadCount: 0 };
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.notifications.delete({ id, userId });
    if (!result.affected) throw new NotFoundException('Notification not found');
  }

  /** A missing row means "all defaults"; it is created lazily on first PATCH. */
  async getPreferences(userId: string): Promise<NotificationPreferences> {
    return serializePreferences(await this.preferences.findOneBy({ userId }));
  }

  async updatePreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferences> {
    try {
      return await this.applyPreferences(userId, dto);
    } catch (error) {
      // Two toggles flipped at once both find no row and both insert; the loser
      // hits UQ_notification_preferences_user. Re-applying on top of the
      // winner's row is correct, and cheaper than locking a settings write.
      const duplicate =
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { code?: string }).code === 'ER_DUP_ENTRY';
      if (!duplicate) throw error;
      return this.applyPreferences(userId, dto);
    }
  }

  private async applyPreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferences> {
    const existing = await this.preferences.findOneBy({ userId });
    const row =
      existing ??
      this.preferences.create({ userId, ...serializePreferences(null) });
    // Only the switches present in the body move: a settings screen sends what
    // the customer touched, and absent keys must keep their stored value.
    if (dto.orderUpdates !== undefined) row.orderUpdates = dto.orderUpdates;
    if (dto.reviewUpdates !== undefined) row.reviewUpdates = dto.reviewUpdates;
    if (dto.promotions !== undefined) row.promotions = dto.promotions;
    if (dto.stockAlerts !== undefined) row.stockAlerts = dto.stockAlerts;
    if (dto.productAnswers !== undefined)
      row.productAnswers = dto.productAnswers;
    return serializePreferences(await this.preferences.save(row));
  }
}
