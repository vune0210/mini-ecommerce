import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { CancelReturnDto } from './dto/cancel-return.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { ListAdminReturnsDto, ListReturnsDto } from './dto/list-returns.dto';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';
import { ReturnRequest } from './entities/return-request.entity';
import { VisibleReturnStatusEvent } from './return-rules';
import { PaginatedReturnRequests, ReturnsService } from './returns.service';

@ApiTags('returns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Post()
  @ApiCreatedResponse({
    description:
      "Opens a return against a completed order of the caller, inside the return window. Quantities already claimed by the order's other open returns are not returnable again.",
  })
  create(
    @Request() request: { user: AuthenticatedUser },
    @Body() dto: CreateReturnDto,
  ): Promise<ReturnRequest> {
    return this.returns.create(request.user, dto);
  }

  @Get()
  list(
    @Request() request: { user: AuthenticatedUser },
    @Query() query: ListReturnsDto,
  ): Promise<PaginatedReturnRequests> {
    return this.returns.findMine(request.user.id, query);
  }

  // Declared before ':id' so the literal segment is not swallowed by the param.
  @Get(':id/history')
  @ApiOkResponse({
    description:
      'Status-history events for the return, oldest first. A null fromStatus marks the creation event. The actor is exposed as role + display name; actorId is non-null only for admin viewers.',
  })
  history(
    @Param('id') id: string,
    @Request() request: { user: AuthenticatedUser },
  ): Promise<VisibleReturnStatusEvent[]> {
    return this.returns.history(id, request.user);
  }

  @Get(':id')
  detail(
    @Param('id') id: string,
    @Request() request: { user: AuthenticatedUser },
  ): Promise<ReturnRequest> {
    return this.returns.findOne(id, request.user);
  }

  @Patch(':id/cancel')
  @ApiOkResponse({
    description:
      'Withdraws a return request. Allowed only while it is still REQUESTED — once staff have approved or rejected it, the decision is theirs.',
  })
  cancel(
    @Param('id') id: string,
    @Request() request: { user: AuthenticatedUser },
    @Body() dto: CancelReturnDto,
  ): Promise<ReturnRequest> {
    return this.returns.cancel(id, request.user, dto);
  }
}

@ApiTags('admin-returns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/returns')
export class AdminReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  @ApiOkResponse({
    description:
      'Every return request. Filter with ?status=, search return number, order number, customer name or email with ?search=.',
  })
  list(@Query() query: ListAdminReturnsDto): Promise<PaginatedReturnRequests> {
    return this.returns.findAll(query);
  }

  @Patch(':id/status')
  @ApiOkResponse({
    description:
      'Moves the request along REQUESTED -> APPROVED -> RECEIVED -> REFUNDED, or to REJECTED. RECEIVED is the transition that returns the goods to stock and writes the ledger entry.',
  })
  status(
    @Param('id') id: string,
    @Body() dto: UpdateReturnStatusDto,
    @Request() request: { user: AuthenticatedUser },
  ): Promise<ReturnRequest> {
    return this.returns.updateStatus(id, dto, request.user);
  }
}
