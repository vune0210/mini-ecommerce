import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  HealthReport,
  HealthService,
  InfoReport,
  LivenessReport,
  ReadinessReport,
} from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOkResponse({
    description:
      'Combined probe, kept for compatibility: 200 while MySQL answers. New deployments should point liveness at /health/live and readiness at /health/ready instead.',
  })
  @ApiServiceUnavailableResponse({
    description: 'A dependency is unreachable.',
  })
  check(): Promise<HealthReport> {
    return this.healthService.check();
  }

  @Get('live')
  @ApiOkResponse({
    description:
      'Liveness. Never touches the database on purpose — a probe that fails during a MySQL outage would restart every replica in a loop without bringing MySQL back.',
  })
  live(): LivenessReport {
    return this.healthService.liveness();
  }

  @Get('ready')
  @ApiOkResponse({
    description:
      'Dependencies are up and the schema is at the latest migration.',
  })
  @ApiServiceUnavailableResponse({
    description:
      'Drain this instance: MySQL is unreachable, or the container started ahead of its migration step.',
  })
  ready(): Promise<ReadinessReport> {
    return this.healthService.readiness();
  }

  @Get('info')
  @ApiOkResponse({
    description:
      'Build identity: version, short commit, environment, Node version and uptime. Read from deploy variables, never from a bundled manifest.',
  })
  info(): InfoReport {
    return this.healthService.info();
  }
}
