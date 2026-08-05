import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountOverview, AccountService } from './account.service';

@ApiTags('account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get('overview')
  @ApiOkResponse({
    description:
      'Everything the account landing page needs in one request: order counts by status, lifetime spend over countable orders only, saved-item counts, review progress, and the short list of things the customer can act on now.',
  })
  overview(
    @Request() request: { user: AuthenticatedUser },
  ): Promise<AccountOverview> {
    return this.account.overview(
      request.user.id,
      request.user.emailVerified ?? true,
    );
  }
}
