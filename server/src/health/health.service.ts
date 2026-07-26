import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type DependencyStatus = { status: 'up' | 'down'; latencyMs?: number };

export type HealthReport = {
  status: 'ok';
  uptimeSeconds: number;
  database: DependencyStatus;
};

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * A liveness probe that answers 200 while MySQL is unreachable is worse than
   * no probe: the container stays in rotation serving 500s. Answering 503 here
   * lets an orchestrator restart or drain the instance.
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
