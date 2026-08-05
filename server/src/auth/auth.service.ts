import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthenticatedUser, JwtPayload, RequestOrigin } from './auth.types';
import {
  RefreshSession,
  SessionRevokeReason,
} from './entities/refresh-session.entity';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import {
  hashRefreshToken,
  PublicSession,
  refreshExpiry,
  serializeSession,
  sessionState,
} from './session-rules';
import { isEmailVerified } from './token-rules';
import { User, UserRole } from '../users/entities/user.entity';

export type TokenPair = {
  accessToken: string;
  /**
   * Rotated on every refresh — the value returned here replaces the one that
   * was sent. A client that keeps using the old token is treated as a replay.
   */
  refreshToken: string;
};

export type AuthResponse = { user: AuthenticatedUser } & TokenPair;

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    @InjectRepository(RefreshSession)
    private readonly sessions: Repository<RefreshSession>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthenticatedUser> {
    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.usersRepository.findOneBy({ email });
    if (existingUser)
      throw new ConflictException('Email is already registered');

    const user = this.usersRepository.create({
      email,
      name: dto.name.trim(),
      password: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
      role: UserRole.CUSTOMER,
    });
    const savedUser = await this.usersRepository.save(user);
    return this.toAuthenticatedUser(savedUser);
  }

  async login(dto: LoginDto, origin: RequestOrigin): Promise<AuthResponse> {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email: dto.email.trim().toLowerCase() })
      .getOne();

    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    // Checked only after the password matched, so the specific message never
    // reveals whether an email is registered to someone probing credentials.
    if (!user.isActive)
      throw new UnauthorizedException('Account is deactivated');

    const { tokens } = await this.startSession(user, origin);
    return { user: this.toAuthenticatedUser(user), ...tokens };
  }

  /**
   * Consumes a refresh token and issues a fresh pair. The presented token is
   * always retired: a leaked refresh token is otherwise valid for its full
   * seven days with no way to tell it is being used twice.
   *
   * Replaying a token that was already rotated (outside the grace window) is
   * the signature of a stolen token being used alongside the legitimate one, so
   * the entire rotation chain is revoked rather than just the presented leaf.
   */
  async refresh(
    refreshToken: string,
    origin: RequestOrigin,
  ): Promise<TokenPair> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const session = await this.sessions.findOneBy({ id: payload.jti });
    if (!session) throw this.invalidRefresh();

    const now = new Date();
    const presentedHash = hashRefreshToken(refreshToken);
    let state = sessionState(session, presentedHash, now);

    if (state === 'reuse') {
      await this.revokeFamily(
        session.familyId,
        SessionRevokeReason.REUSE_DETECTED,
      );
      this.logger.warn({
        message: 'Refresh token replay detected; session family revoked',
        userId: session.userId,
        familyId: session.familyId,
        sessionId: session.id,
      });
      throw this.invalidRefresh();
    }
    if (state === 'revoked' || state === 'expired') throw this.invalidRefresh();

    const user = await this.usersRepository.findOneBy({ id: session.userId });
    if (!user) throw this.invalidRefresh();
    if (!user.isActive) {
      await this.revokeAllSessions(
        user.id,
        SessionRevokeReason.ACCOUNT_DISABLED,
      );
      throw this.invalidRefresh();
    }

    if (state === 'active') {
      // Compare-and-set, not read-then-write: two tabs refreshing together both
      // read `active`, and without the WHERE clause both would mint a child and
      // the second UPDATE would overwrite the first row's replaced_by pointer.
      const claim = await this.sessions.update(
        { id: session.id, revokedAt: IsNull() },
        {
          revokedAt: now,
          revokedReason: SessionRevokeReason.ROTATED,
          lastUsedAt: now,
        },
      );
      if (claim.affected === 0) {
        // The other tab won. Re-read and let the grace window decide whether
        // this is that same benign race or a genuine replay.
        const current = await this.sessions.findOneBy({ id: session.id });
        if (!current) throw this.invalidRefresh();
        state = sessionState(current, presentedHash, now);
        if (state !== 'grace') throw this.invalidRefresh();
      }
    } else {
      await this.sessions.update({ id: session.id }, { lastUsedAt: now });
    }

    const { tokens, sessionId } = await this.startSession(
      user,
      origin,
      session.familyId,
    );
    if (state === 'active')
      await this.sessions.update(
        { id: session.id },
        { replacedById: sessionId },
      );
    return tokens;
  }

  /**
   * Revokes the named refresh token, falling back to the session the caller's
   * own access token belongs to. Only when neither is known — an access token
   * minted before sessions existed — does it clear every session, because
   * "logged out of something" is the one outcome a logout must never miss.
   */
  async logout(user: AuthenticatedUser, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const payload = await this.verifyRefreshToken(refreshToken).catch(
        () => null,
      );
      // A malformed or already-dead token means the session is gone; logging
      // out is idempotent, so that is success, not a 401.
      if (payload?.jti) await this.revokeSession(user.id, payload.jti);
      return;
    }
    if (user.sessionId) {
      await this.revokeSession(user.id, user.sessionId);
      return;
    }
    await this.revokeAllSessions(user.id, SessionRevokeReason.LOGOUT_ALL);
  }

  /** Live sessions only — revoked and expired rows are history, not devices. */
  async listSessions(
    userId: string,
    currentSessionId: string | null = null,
  ): Promise<PublicSession[]> {
    const rows = await this.sessions.find({
      where: { userId, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => serializeSession(row, currentSessionId));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await this.sessions.update(
      { id: sessionId, userId, revokedAt: IsNull() },
      { revokedAt: new Date(), revokedReason: SessionRevokeReason.LOGOUT },
    );
  }

  async revokeAllSessions(
    userId: string,
    reason: SessionRevokeReason,
  ): Promise<void> {
    await this.sessions.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date(), revokedReason: reason },
    );
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<AuthenticatedUser> {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) throw new UnauthorizedException();
    if (dto.name !== undefined) user.name = dto.name.trim();
    await this.usersRepository.save(user);
    return this.toAuthenticatedUser(user);
  }

  /**
   * Changing a password invalidates every refresh session, including the
   * caller's: the point of the change is usually that the old credentials
   * leaked, and leaving live sessions behind would defeat it. The caller gets a
   * brand-new session back so the request that changed the password does not
   * log itself out.
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    origin: RequestOrigin,
  ): Promise<TokenPair> {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :id', { id: userId })
      .getOne();
    if (!user) throw new UnauthorizedException();
    if (!(await bcrypt.compare(dto.currentPassword, user.password)))
      throw new UnauthorizedException('Current password is incorrect');
    if (dto.currentPassword === dto.newPassword)
      throw new ConflictException(
        'The new password must differ from the current one',
      );

    user.password = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.usersRepository.save(user);
    await this.revokeAllSessions(user.id, SessionRevokeReason.PASSWORD_CHANGED);
    // A security notice the customer cannot mute. If the change was not theirs,
    // this is the record that tells them — and an alert about account takeover
    // that can be silenced would be silenced first by whoever took the account.
    await this.notifications.notify(null, {
      userId: user.id,
      type: NotificationType.ACCOUNT_SECURITY,
      title: 'Mật khẩu của bạn đã được thay đổi',
      body: `Mọi phiên đăng nhập khác đã bị đăng xuất${origin.ipAddress ? ` (yêu cầu từ ${origin.ipAddress})` : ''}. Nếu không phải bạn, hãy đặt lại mật khẩu ngay.`,
    });
    return (await this.startSession(user, origin)).tokens;
  }

  /**
   * The reset counterpart of `changePassword`, kept beside it so the two can
   * never drift on the part that matters: setting the password revokes every
   * refresh session. The reason is sharper here — a reset is what someone does
   * when they think their credentials leaked, so a session an attacker already
   * opened has to die with the old password.
   *
   * No token pair comes back. The caller is anonymous, holding nothing but a
   * secret that arrived by email; handing them a live session off the back of
   * it would be a full login without the new password ever being typed.
   *
   * `update` rather than `save`: the row is not loaded here, and `save` on a
   * partial entity would null every column that was not read back.
   */
  async resetPassword(userId: string, newPassword: string): Promise<void> {
    await this.usersRepository.update(
      { id: userId },
      { password: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) },
    );
    await this.revokeAllSessions(userId, SessionRevokeReason.PASSWORD_CHANGED);
  }

  /**
   * Mints a session row and the token pair that names it. The row id is
   * generated up front because it travels inside the refresh token as `jti`;
   * that is what lets a presented token find its own row by primary key.
   */
  private async startSession(
    user: User,
    origin: RequestOrigin,
    familyId?: string,
  ): Promise<{ tokens: TokenPair; sessionId: string }> {
    const sessionId = randomUUID();
    const family = familyId ?? sessionId;
    const now = new Date();
    const refreshToken = await this.jwtService.signAsync(
      { ...this.payloadFor(user, 'refresh'), jti: sessionId, fam: family },
      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      },
    );
    await this.sessions.insert({
      id: sessionId,
      userId: user.id,
      familyId: family,
      tokenHash: hashRefreshToken(refreshToken),
      userAgent: origin.userAgent,
      ipAddress: origin.ipAddress,
      expiresAt: refreshExpiry(now),
    });
    return {
      tokens: {
        accessToken: await this.signAccessToken(user, sessionId),
        refreshToken,
      },
      sessionId,
    };
  }

  private async revokeFamily(
    familyId: string,
    reason: SessionRevokeReason,
  ): Promise<void> {
    await this.sessions.update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: new Date(), revokedReason: reason },
    );
  }

  private async verifyRefreshToken(token: string): Promise<JwtPayload> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw this.invalidRefresh();
    }
    // Tokens minted before sessions existed carry no jti and cannot name a row.
    if (payload.type !== 'refresh' || !payload.jti) throw this.invalidRefresh();
    return payload;
  }

  /** One message for every failure mode, so probing cannot distinguish them. */
  private invalidRefresh(): UnauthorizedException {
    return new UnauthorizedException('Invalid or expired refresh token');
  }

  /**
   * The access token carries its session id so `GET /auth/sessions` can flag
   * the current device and `POST /auth/logout` can end the right session
   * without the client having to send its refresh token back.
   */
  private signAccessToken(user: User, sessionId?: string): Promise<string> {
    return this.jwtService.signAsync(
      {
        ...this.payloadFor(user, 'access'),
        ...(sessionId ? { sid: sessionId } : {}),
      },
      {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      },
    );
  }

  private payloadFor(user: User, type: JwtPayload['type']): JwtPayload {
    return { sub: user.id, email: user.email, role: user.role, type };
  }

  private toAuthenticatedUser(user: User): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: isEmailVerified(user),
    };
  }
}
