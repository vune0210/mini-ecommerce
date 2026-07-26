import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthenticatedUser, JwtPayload } from './auth.types';
import { User, UserRole } from '../users/entities/user.entity';

type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthenticatedUser> {
    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.usersRepository.findOneBy({ email });
    if (existingUser)
      throw new ConflictException('Email is already registered');

    const user = this.usersRepository.create({
      email,
      name: dto.name.trim(),
      password: await bcrypt.hash(dto.password, 12),
      role: UserRole.CUSTOMER,
    });
    const savedUser = await this.usersRepository.save(user);
    return this.toAuthenticatedUser(savedUser);
  }

  async login(dto: LoginDto): Promise<{ user: AuthenticatedUser } & TokenPair> {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email: dto.email.trim().toLowerCase() })
      .getOne();

    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return {
      user: this.toAuthenticatedUser(user),
      ...(await this.issueTokens(user)),
    };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        refreshToken,
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        },
      );
      if (payload.type !== 'refresh') throw new UnauthorizedException();

      const user = await this.usersRepository.findOneBy({ id: payload.sub });
      if (!user) throw new UnauthorizedException();

      return { accessToken: await this.signAccessToken(user) };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private async issueTokens(user: User): Promise<TokenPair> {
    return {
      accessToken: await this.signAccessToken(user),
      refreshToken: await this.jwtService.signAsync(
        this.payloadFor(user, 'refresh'),
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: '7d',
        },
      ),
    };
  }

  private signAccessToken(user: User): Promise<string> {
    return this.jwtService.signAsync(this.payloadFor(user, 'access'), {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
    });
  }

  private payloadFor(user: User, type: JwtPayload['type']): JwtPayload {
    return { sub: user.id, email: user.email, role: user.role, type };
  }

  private toAuthenticatedUser(user: User): AuthenticatedUser {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }
}
