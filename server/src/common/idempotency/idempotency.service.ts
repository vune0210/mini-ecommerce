import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, QueryFailedError, Repository } from 'typeorm';
import {
  IdempotencyKey,
  IdempotencyState,
} from './entities/idempotency-key.entity';
import {
  hashRequest,
  idempotencyExpiry,
  idempotencyOutcome,
} from './idempotency-rules';

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly keys: Repository<IdempotencyKey>,
  ) {}

  /**
   * Runs `handler` at most once per (caller, scope, key).
   *
   * The claim is an INSERT against a unique index, never a SELECT-then-INSERT:
   * a customer double-tapping "place order" fires two requests that race, and
   * only the database can decide which one wins. The loser reads the row back
   * and either replays the winner's response or is told the first attempt is
   * still running.
   *
   * A caller that passes no key runs unguarded — this is opt-in, so clients
   * that predate the header keep working exactly as before.
   */
  async run<T>(
    userId: string,
    scope: string,
    key: string | null,
    payload: unknown,
    handler: () => Promise<T>,
  ): Promise<T> {
    if (!key) return handler();

    const requestHash = hashRequest(payload);
    const now = new Date();
    const claimed = await this.claim(userId, scope, key, requestHash, now);
    if (!claimed)
      return this.resolveExisting<T>(userId, scope, key, requestHash);

    try {
      const result = await handler();
      claimed.state = IdempotencyState.COMPLETED;
      claimed.responseStatus = 201;
      // Round-tripped through JSON so the stored copy is byte-identical to what
      // the client received — Dates become the same ISO strings, and a replay is
      // indistinguishable from the original answer. Written through `save` on
      // the loaded row rather than `update`, because a partial update of a json
      // column is not expressible in TypeORM's DeepPartial typing.
      claimed.responseBody = JSON.parse(JSON.stringify(result)) as Record<
        string,
        unknown
      >;
      await this.keys.save(claimed);
      return result;
    } catch (error) {
      // The operation failed, so the key must NOT stay claimed: a retry of a
      // checkout that hit a stock conflict has to be allowed to succeed once
      // the customer fixes their cart.
      await this.keys.delete({ id: claimed.id });
      throw error;
    }
  }

  /** Returns null when the key is already taken by a live row. */
  private async claim(
    userId: string,
    scope: string,
    key: string,
    requestHash: string,
    now: Date,
  ): Promise<IdempotencyKey | null> {
    try {
      const record = this.keys.create({
        userId,
        scope,
        idempotencyKey: key,
        requestHash,
        state: IdempotencyState.IN_FLIGHT,
        expiresAt: idempotencyExpiry(now),
      });
      return await this.keys.save(record);
    } catch (error) {
      const duplicate =
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { code?: string }).code === 'ER_DUP_ENTRY';
      if (!duplicate) throw error;
      return null;
    }
  }

  private async resolveExisting<T>(
    userId: string,
    scope: string,
    key: string,
    requestHash: string,
  ): Promise<T> {
    const existing = await this.keys.findOneBy({
      userId,
      scope,
      idempotencyKey: key,
    });
    // Vanished between the failed insert and this read — the previous attempt
    // errored and cleaned up, so the caller may simply try again.
    if (!existing)
      throw new ConflictException(
        'The previous request with this Idempotency-Key failed; retry it',
      );

    switch (idempotencyOutcome(existing, requestHash, new Date())) {
      case 'replay':
        return existing.responseBody as unknown as T;
      case 'conflict':
        throw new ConflictException(
          'Idempotency-Key was already used with a different request body',
        );
      case 'in-flight':
        throw new ConflictException(
          'A request with this Idempotency-Key is still being processed',
        );
      case 'expired':
        // Aged out. Reclaiming the row in place keeps the unique index
        // satisfied without a delete-then-insert that would reopen the race.
        existing.requestHash = requestHash;
        existing.state = IdempotencyState.IN_FLIGHT;
        existing.responseStatus = null;
        existing.responseBody = null;
        existing.expiresAt = idempotencyExpiry(new Date());
        await this.keys.save(existing);
        throw new ConflictException(
          'The previous request with this Idempotency-Key expired; retry it',
        );
    }
  }

  /**
   * Housekeeping for expired rows. Not scheduled — this project has no job
   * runner, and inventing one for a table that grows by a row per checkout
   * would be a heavier dependency than the problem deserves. Exposed so an
   * operator or a future scheduler can call it.
   */
  async purgeExpired(now: Date = new Date()): Promise<number> {
    const removed = await this.keys.delete({ expiresAt: LessThanOrEqual(now) });
    const count = removed.affected ?? 0;
    if (count > 0)
      this.logger.log({ message: 'Purged expired idempotency keys', count });
    return count;
  }
}
