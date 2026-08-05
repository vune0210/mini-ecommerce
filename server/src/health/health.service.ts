import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  buildInfo,
  DependencyStatus,
  ReadinessChecks,
  readinessStatus,
} from './health-rules';

export type { DependencyStatus } from './health-rules';

export type HealthReport = {
  status: 'ok';
  uptimeSeconds: number;
  database: DependencyStatus;
};

export type LivenessReport = { status: 'alive'; uptimeSeconds: number };

export type ReadinessReport = {
  status: 'ready';
  uptimeSeconds: number;
  checks: ReadinessChecks;
};

export type InfoReport = {
  version: string;
  commit: string | null;
  environment: string;
  uptimeSeconds: number;
  node: string;
};

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * The original combined probe. Kept because the README, the SPA's /health
   * page and any existing container healthcheck point at it. New deployments
   * should split their probes across `liveness` and `readiness` instead — the
   * comments there explain why one endpoint cannot answer both questions.
   */
  async check(): Promise<HealthReport> {
    const database = await this.pingDatabase();
    const uptimeSeconds = Math.floor(process.uptime());

    if (database.status === 'down') {
      throw new ServiceUnavailableException({
        status: 'degraded',
        uptimeSeconds,
        database,
      });
    }

    return { status: 'ok', uptimeSeconds, database };
  }

  /**
   * Liveness answers exactly one question: is this process wedged?
   *
   * It deliberately does NOT touch the database. A liveness probe that fails
   * during a MySQL outage makes the orchestrator restart every replica, in a
   * loop, and none of those restarts bring MySQL back — they just destroy the
   * capacity that would have recovered on its own. Dependency health belongs
   * in readiness, where the response is to drain traffic, not to kill the
   * container.
   */
  liveness(): LivenessReport {
    return { status: 'alive', uptimeSeconds: Math.floor(process.uptime()) };
  }

  /**
   * Readiness answers: should this instance receive traffic right now? A 503
   * takes it out of the load balancer without restarting it, which is the
   * right response both to a dependency being down and to a container that
   * started ahead of its migration step.
   */
  async readiness(): Promise<ReadinessReport> {
    const [database, migrations] = await Promise.all([
      this.pingDatabase(),
      this.pendingMigrations(),
    ]);
    const checks: ReadinessChecks = { database, migrations };
    const uptimeSeconds = Math.floor(process.uptime());
    if (readinessStatus(checks) === 'not-ready')
      throw new ServiceUnavailableException({
        status: 'not-ready',
        uptimeSeconds,
        checks,
      });
    return { status: 'ready', uptimeSeconds, checks };
  }

  info(): InfoReport {
    return {
      ...buildInfo(process.env),
      uptimeSeconds: Math.floor(process.uptime()),
      node: process.version,
    };
  }

  /**
   * `showMigrations()` is true when something is still unapplied. A schema
   * behind the code is the failure this catches: the container boots, answers
   * 200, and then 500s on the first request that touches a new column.
   */
  private async pendingMigrations(): Promise<ReadinessChecks['migrations']> {
    try {
      if (!this.dataSource.isInitialized) return { status: 'down' };
      const pending = await this.dataSource.showMigrations();
      return pending
        ? { status: 'down', pending: 1 }
        : { status: 'up', pending: 0 };
    } catch (error) {
      this.logger.error({
        message: 'Migration readiness check failed',
        detail: error instanceof Error ? error.message : String(error),
      });
      return { status: 'down' };
    }
  }

  private async pingDatabase(): Promise<DependencyStatus> {
    const startedAt = Date.now();
    try {
      if (!this.dataSource.isInitialized) return { status: 'down' };
      await this.dataSource.query('SELECT 1');
      return { status: 'up', latencyMs: Date.now() - startedAt };
    } catch (error) {
      this.logger.error({
        message: 'Database health check failed',
        detail: error instanceof Error ? error.message : String(error),
      });
      return { status: 'down', latencyMs: Date.now() - startedAt };
    }
  }
}
