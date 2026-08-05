import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { AuthToken, AuthTokenPurpose } from './entities/auth-token.entity';
import {
  authTokenExpiry,
  authTokenState,
  buildDelivery,
  hashAuthToken,
  maskEmail,
  redactDelivery,
} from './token-rules';
import { User } from '../users/entities/user.entity';

/**
 * 256 bits from the CSPRNG, base64url so it survives a query string untouched.
 * Guessing is not a threat model at this width — the tokens are single-use and
 * hour-boxed on top, so the only realistic attack is theft of the mail itself.
 */
const TOKEN_BYTES = 32;

/** Non-production only: the secret a mail transport would have delivered. */
export type DevTokenHint = { devToken?: string };

export type VerificationRequestResult = DevTokenHint & {
  /** True when the address was already proven and no token was minted. */
  alreadyVerified: boolean;
};

/**
 * Password reset and email verification.
 *
 * There is no SMTP transport in this project. Rather than pretend otherwise,
 * every mint builds the exact payload a transport would receive and hands it to
 * `deliver`, which logs it in development and reduces it to an audit line in
 * production. Wiring a real mailer later means replacing one private method.
 */
@Injectable()
export class AuthTokensService {
  private readonly logger = new Logger(AuthTokensService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    @InjectRepository(AuthToken)
    private readonly tokens: Repository<AuthToken>,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Mints a reset token for a registered address, and does nothing at all for
   * anything else. The caller gets the same 202 either way — see the controller
   * — because a 404, a different message, or even a different shape here would
   * turn this endpoint into a free account-existence oracle for anyone with a
   * list of addresses to test.
   *
   * Deactivated accounts are treated as absent: letting a disabled account reset
   * its way back in would route around the deactivation entirely.
   *
   * Residual: minting costs an INSERT plus an UPDATE, so a registered address
   * answers marginally slower than an unknown one. Closing that would mean
   * doing equivalent dummy work for every unknown address; the gap is well
   * inside network jitter and is accepted rather than hidden.
   */
  async requestPasswordReset(dto: ForgotPasswordDto): Promise<void> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersRepository.findOneBy({ email });
    if (!user || !user.isActive) {
      // Debug, not warn: an unknown address is the normal case for a typo, and
      // a warn-level line per attempt is its own denial-of-service on the logs.
      this.logger.debug({
        message: 'Password reset requested for an unusable address; ignored',
        email: maskEmail(email),
      });
      return;
    }
    await this.mint(user, AuthTokenPurpose.PASSWORD_RESET);
  }

  /**
   * Redeems a reset token. The password change revokes every refresh session
   * for the account, exactly as `AuthService.changePassword` does and for a
   * sharper reason: a reset is the flow someone uses when they believe their
   * credentials leaked, so any session an attacker already established has to
   * die with the old password.
   *
   * Nothing is returned but a confirmation. Unlike `changePassword`, the caller
   * here is anonymous — there is no session to keep alive, and minting one off
   * the back of an emailed token would hand out a full login without the new
   * password ever being typed.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const token = await this.consume(
      dto.token,
      AuthTokenPurpose.PASSWORD_RESET,
    );
    await this.authService.resetPassword(token.userId, dto.newPassword);
    this.logger.log({
      message: 'Password reset completed; all sessions revoked',
      userId: token.userId,
    });
  }

  /**
   * Mints a verification token for the caller's own address. Authenticated, so
   * there is no existence oracle to protect here and the dev-mode secret can be
   * returned to the caller directly.
   */
  async requestEmailVerification(
    userId: string,
  ): Promise<VerificationRequestResult> {
    const user = await this.usersRepository.findOneBy({ id: userId });
    // A stale-but-valid access token for a deleted row: nothing to verify, and
    // no reason to leak which of the two it was.
    if (!user) throw this.invalidToken();
    if (user.emailVerifiedAt) return { alreadyVerified: true };

    const devToken = await this.mint(user, AuthTokenPurpose.EMAIL_VERIFICATION);
    return { alreadyVerified: false, ...(devToken ? { devToken } : {}) };
  }

  /**
   * Redeems a verification token. Public by necessity: the link is clicked from
   * a mail client that carries no bearer token, and the token itself is the
   * proof of identity.
   */
  async confirmEmailVerification(
    dto: VerifyEmailDto,
  ): Promise<{ emailVerified: true }> {
    const token = await this.consume(
      dto.token,
      AuthTokenPurpose.EMAIL_VERIFICATION,
    );
    // Guarded on IS NULL so a re-verification never rewrites the date the
    // address was *first* proven — that timestamp is evidence, not a cache.
    await this.usersRepository.update(
      { id: token.userId, emailVerifiedAt: IsNull() },
      { emailVerifiedAt: new Date() },
    );
    return { emailVerified: true };
  }

  /**
   * Issues one token and voids the account's outstanding ones for the same
   * purpose. Returns the secret only outside production.
   *
   * Superseding comes first, and deliberately: when a customer asks for a
   * second reset email it is usually because the first never arrived or went
   * somewhere they no longer trust. The older link has to stop working the
   * instant the new one exists, not merely when its hour runs out.
   */
  private async mint(
    user: User,
    purpose: AuthTokenPurpose,
  ): Promise<string | undefined> {
    const now = new Date();
    await this.tokens.update(
      { userId: user.id, purpose, consumedAt: IsNull() },
      { consumedAt: now },
    );

    const secret = randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = authTokenExpiry(now, purpose);
    await this.tokens.insert({
      userId: user.id,
      purpose,
      // The row never sees the secret; only this digest is persisted.
      tokenHash: hashAuthToken(secret),
      expiresAt,
    });

    return this.deliver(user, purpose, secret, expiresAt, now);
  }

  /**
   * Looks a token up by hash *and* purpose, then claims it.
   *
   * The purpose is part of the WHERE clause, not an assertion afterwards: a
   * 24-hour verification token must never be redeemable on the reset endpoint,
   * which would trade the weaker credential for total account takeover.
   *
   * The claim is a compare-and-set for the same reason rotation is in
   * `AuthService.refresh`: mail clients and security scanners routinely prefetch
   * links, so the same token legitimately arrives twice within milliseconds.
   * Only the UPDATE that actually changes a row is allowed to proceed.
   */
  private async consume(
    presented: string,
    purpose: AuthTokenPurpose,
  ): Promise<AuthToken> {
    const token = await this.tokens.findOneBy({
      tokenHash: hashAuthToken(presented),
      purpose,
    });
    if (!token) throw this.invalidToken();

    const now = new Date();
    if (authTokenState(token, now) !== 'active') throw this.invalidToken();

    const claim = await this.tokens.update(
      { id: token.id, consumedAt: IsNull() },
      { consumedAt: now },
    );
    if (claim.affected === 0) throw this.invalidToken();
    return token;
  }

  /**
   * Stands in for the mail transport this project does not have.
   *
   * In production the secret is neither logged nor returned. A log aggregator is
   * a second store, readable by far more people than the database, and a token
   * sitting in it is as good as the account — the whole reason only the SHA-256
   * reaches the table. What is left is an audit line proving a token was minted.
   *
   * Outside production the full payload is logged and the secret handed back, so
   * the flow is exercisable without SMTP. Gated on NODE_ENV rather than on a new
   * variable so there is no switch anyone can accidentally set in a deployment.
   */
  private deliver(
    user: User,
    purpose: AuthTokenPurpose,
    secret: string,
    expiresAt: Date,
    now: Date,
  ): string | undefined {
    const delivery = buildDelivery(user.email, purpose, secret, expiresAt, now);
    if (this.isProduction()) {
      this.logger.warn({
        message:
          'Auth token minted but no mail transport is configured; it cannot be delivered',
        userId: user.id,
        ...redactDelivery(delivery),
      });
      return undefined;
    }
    this.logger.log({
      message:
        'DEVELOPMENT ONLY — auth token delivery payload (no mail transport configured)',
      userId: user.id,
      ...delivery,
    });
    return secret;
  }

  private isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  /**
   * One message for every failure mode — unknown, expired, consumed, or minted
   * for a different purpose — so probing cannot tell them apart.
   *
   * 400 rather than 401: these endpoints are anonymous, there is no
   * authentication scheme to challenge, and SPAs routinely wire a global 401
   * interceptor that would sign the user out over a mistyped link.
   */
  private invalidToken(): BadRequestException {
    return new BadRequestException('Invalid or expired token');
  }
}
