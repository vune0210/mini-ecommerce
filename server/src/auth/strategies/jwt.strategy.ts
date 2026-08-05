import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Repository } from 'typeorm';
import { JwtPayload, AuthenticatedUser } from '../auth.types';
import { isEmailVerified } from '../token-rules';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (payload.type !== 'access') throw new UnauthorizedException();

    const user = await this.usersRepository.findOneBy({ id: payload.sub });
    if (!user) throw new UnauthorizedException();
    // The row is re-read on every request anyway, so deactivation takes
    // effect on the very next call — no token revocation machinery needed.
    if (!user.isActive)
      throw new UnauthorizedException('Account is deactivated');

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      // Read from the row, not the token, so clicking the verification link
      // takes effect on the very next request without a re-login.
      emailVerified: isEmailVerified(user),
      // Null for tokens minted before refresh sessions existed; session-aware
      // endpoints degrade rather than assume the claim is present.
      sessionId: payload.sid ?? null,
    };
  }
}
