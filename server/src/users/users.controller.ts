import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UserRole } from './entities/user.entity';
import { PublicUser } from './user-rules';
import { PaginatedUsers, UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOkResponse({ description: 'Paginated user accounts for admins.' })
  list(@Query() query: ListUsersDto): Promise<PaginatedUsers> {
    return this.users.findAll(query);
  }

  @Patch(':id/role')
  changeRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @Request() request: { user: AuthenticatedUser },
  ): Promise<PublicUser> {
    return this.users.changeRole(id, dto, request.user);
  }

  @Patch(':id/status')
  setActive(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @Request() request: { user: AuthenticatedUser },
  ): Promise<PublicUser> {
    return this.users.setActive(id, dto, request.user);
  }
}
