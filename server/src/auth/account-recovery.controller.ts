import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RateLimit } from '../common/throttle/rate-limit.decorator';
import {
  AuthTokensService,
  VerificationRequestResult,
} from './auth-tokens.service';
import { AuthenticatedUser } from './auth.types';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const MINUTE = 60_000;

/**
 * The one sentence `/forgot-password` is ever allowed to say. Frozen in a
 * constant so a future edit cannot accidentally give the registered and
 * unregistered paths two different wordings — which is the enumeration leak the
 * endpoint exists to avoid.
 */
const FORGOT_PASSWORD_MESSAGE =
  'If that address has an account, a password reset link is on its way.';

/**
 * Out-of-band credential flows, split from AuthController because they share
 * nothing with it but the URL prefix: no session handling, no token pairs, and
 * a different failure posture (never confirm or deny an address).
 */
@ApiTags('auth')
@Controller('auth')
export class AccountRecoveryController {
  constructor(private readonly authTokens: AuthTokensService) {}

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  // Stricter than login: a login attempt costs a bcrypt compare, but a reset
  // request costs somebody else's inbox. Five per quarter hour is more than any
  // human needs and makes mail-bombing one address pointless. Anonymous, so the
  // budget is per IP.
  @RateLimit({ limit: 5, windowMs: 15 * MINUTE })
  @ApiAcceptedResponse({
    description:
      'Always 202 with the same body, whether or not the address is registered — a different answer would be an account-existence oracle. With no mail transport configured the token is logged server-side outside production; it is never returned here.',
  })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    await this.authTokens.requestPasswordReset(dto);
    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  // A valid token is 256 bits, so this is not what stops guessing; it stops a
  // harvested list of candidate tokens being replayed at speed.
  @RateLimit({ limit: 10, windowMs: 15 * MINUTE })
  @ApiOkResponse({
    description:
      'Consumes the token, sets the password, and revokes every refresh session for the account. No tokens are issued: the caller signs in with the new password.',
  })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    await this.authTokens.resetPassword(dto);
    return {
      message: 'Password updated. All existing sessions have been signed out.',
    };
  }

  @Post('verify-email/request')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  // Charged per account by the guard once authenticated, so this is a cap on
  // one user re-sending to themselves rather than on an office behind one NAT.
  @RateLimit({ limit: 5, windowMs: 60 * MINUTE })
  @ApiBearerAuth()
  @ApiAcceptedResponse({
    description:
      'Mints a 24-hour verification token for the caller. Returns alreadyVerified: true and mints nothing when the address is already proven. Outside production the token is echoed as devToken because there is no mail transport; in production it is never returned.',
  })
  requestEmailVerification(
    @Request() request: { user: AuthenticatedUser },
  ): Promise<VerificationRequestResult> {
    return this.authTokens.requestEmailVerification(request.user.id);
  }

  @Post('verify-email/confirm')
  @HttpCode(HttpStatus.OK)
  // Public because the link is opened from a mail client, which carries no
  // bearer token; the token in the body is the credential.
  @RateLimit({ limit: 10, windowMs: 15 * MINUTE })
  @ApiOkResponse({
    description: 'Consumes the token and stamps the address as verified.',
  })
  confirmEmail(
    @Body() dto: VerifyEmailDto,
  ): Promise<{ emailVerified: boolean }> {
    return this.authTokens.confirmEmailVerification(dto);
  }
}
