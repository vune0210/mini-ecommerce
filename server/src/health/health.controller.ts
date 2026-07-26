import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HealthReport, HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOkResponse({ description: 'Application is running and MySQL answers.' })
  @ApiServiceUnavailableResponse({
    description: 'A dependency is unreachable.',
  })
  check(): Promise<HealthReport> {
    return this.healthService.check();
  }
}
