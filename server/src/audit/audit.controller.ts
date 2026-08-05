import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { AuditService, PaginatedAuditLog } from './audit.service';
import { ListAuditLogDto } from './dto/list-audit-log.dto';

@ApiTags('admin-audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/audit-log')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOkResponse({
    description:
      'Admin actions, newest first. Filter by actor, action, resource, and a UTC calendar-day range.',
  })
  list(@Query() query: ListAuditLogDto): Promise<PaginatedAuditLog> {
    return this.audit.findAll(query);
  }

  @Get('actions')
  @ApiOkResponse({
    description:
      'Distinct action names present in the log, so a UI filter needs no hard-coded list.',
  })
  async actions(): Promise<{ actions: string[] }> {
    return { actions: await this.audit.distinctActions() };
  }
}
