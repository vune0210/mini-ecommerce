import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../common/throttle/rate-limit.decorator';
import { AuthResponse, AuthService, TokenPair } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SessionRevokeReason } from './entities/refresh-session.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthenticatedUser, RequestOrigin } from './auth.types';
import {
  normalizeIp,
  normalizeUserAgent,
  PublicSession,
} from './session-rules';

type IncomingRequest = {
  user?: AuthenticatedUser;
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: Record<string, string | string[] | undefined>;
};

/** Credential endpoints are the brute-force surface; the reads are not. */
const MINUTE = 60_000;

function originOf(request: IncomingRequest): RequestOrigin {
  return {
    userAgent: normalizeUserAgent(request.headers?.['user-agent']),
    ipAddress: normalizeIp(
      request.ip ?? request.socket?.remoteAddress,
      request.headers?.['x-forwarded-for'],
    ),
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  // Per IP, so it has to tolerate a household or an office behind one NAT
  // signing up in the same afternoon. Twenty an hour still stops scripted
  // account farming dead.
  @RateLimit({ limit: 20, windowMs: 60 * MINUTE })
  register(@Body() dto: RegisterDto): Promise<AuthenticatedUser> {
    return this.authService.register(dto);
  }

  @Post('login')
  @RateLimit({ limit: 10, windowMs: 15 * MINUTE })
  @ApiOkResponse({
    description:
      'Access token (15 min) plus a rotating refresh token (7 days). Store both: the refresh token returned by /auth/refresh replaces the one that was sent.',
  })
  login(
    @Body() dto: LoginDto,
    @Request() request: IncomingRequest,
  ): Promise<AuthResponse> {
    return this.authService.login(dto, originOf(request));
  }

  @Post('refresh')
  // Higher than login on purpose: a busy tab legitimately refreshes often,
  // and a stolen token is caught by rotation rather than by this counter.
  @RateLimit({ limit: 30, windowMs: 15 * MINUTE })
  @ApiOkResponse({
    description:
      'Rotates the session. The presented refresh token is retired; replaying it revokes every session in its rotation chain.',
  })
  refresh(
    @Body() dto: RefreshTokenDto,
    @Request() request: IncomingRequest,
  ): Promise<TokenPair> {
    return this.authService.refresh(dto.refreshToken, originOf(request));
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({
    description:
      'Current authenticated user, including emailVerified. That flag is read from the row on every request, so it flips as soon as the verification link is clicked — no re-login needed.',
  })
  me(@Request() request: { user: AuthenticatedUser }): AuthenticatedUser {
    return request.user;
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Updates the caller display name.' })
  updateProfile(
    @Request() request: { user: AuthenticatedUser },
    @Body() dto: UpdateProfileDto,
  ): Promise<AuthenticatedUser> {
    return this.authService.updateProfile(request.user.id, dto);
  }

  @Patch('password')
  @UseGuards(JwtAuthGuard)
  @RateLimit({ limit: 5, windowMs: 15 * MINUTE })
  @ApiBearerAuth()
  @ApiOkResponse({
    description:
      'Changes the password, revokes every existing session, and returns a fresh token pair for the caller.',
  })
  changePassword(
    @Request() request: IncomingRequest & { user: AuthenticatedUser },
    @Body() dto: ChangePasswordDto,
  ): Promise<TokenPair> {
    return this.authService.changePassword(
      request.user.id,
      dto,
      originOf(request),
    );
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  async logout(
    @Request() request: { user: AuthenticatedUser },
    @Body() dto: LogoutDto,
  ): Promise<void> {
    await this.authService.logout(request.user, dto.refreshToken);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  async logoutAll(
    @Request() request: { user: AuthenticatedUser },
  ): Promise<void> {
    await this.authService.revokeAllSessions(
      request.user.id,
      SessionRevokeReason.LOGOUT_ALL,
    );
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({
    description:
      'Live refresh sessions for the caller, newest first. The entry matching the access token in use is flagged with current: true.',
  })
  sessions(
    @Request() request: { user: AuthenticatedUser },
  ): Promise<PublicSession[]> {
    return this.authService.listSessions(
      request.user.id,
      request.user.sessionId ?? null,
    );
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  async revokeSession(
    @Request() request: { user: AuthenticatedUser },
    @Param('id') id: string,
  ): Promise<void> {
    await this.authService.revokeSession(request.user.id, id);
  }
}
