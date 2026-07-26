import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { User, UserRole } from './entities/user.entity';
import {
  isSelfMutation,
  PublicUser,
  removesActiveAdmin,
  serializeUser,
} from './user-rules';

export type PaginatedUsers = {
  items: PublicUser[];
  total: number;
  page: number;
  limit: number;
};

type UserChange = { role?: UserRole; isActive?: boolean };

@Injectable()
export class UsersService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /**
   * `User.password` is `select: false`, so neither this query builder nor any
   * find below ever loads the hash; `serializeUser` pins the response shape
   * on top of that.
   */
  async findAll(query: ListUsersDto): Promise<PaginatedUsers> {
    const builder = this.users.createQueryBuilder('user');
    const search = query.search?.trim();
    if (search)
      builder.andWhere('(user.name LIKE :search OR user.email LIKE :search)', {
        search: `%${search}%`,
      });
    if (query.role) builder.andWhere('user.role = :role', { role: query.role });
    if (query.isActive !== undefined)
      builder.andWhere('user.isActive = :isActive', {
        isActive: query.isActive,
      });
    const total = await builder.getCount();
    const items = await builder
      .orderBy('user.createdAt', 'DESC')
      .addOrderBy('user.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();
    return {
      items: items.map((user) => serializeUser(user)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async changeRole(
    id: string,
    dto: UpdateUserRoleDto,
    actor: AuthenticatedUser,
  ): Promise<PublicUser> {
    if (isSelfMutation(actor.id, id))
      throw new BadRequestException('You cannot change your own role');
    return this.mutate(id, { role: dto.role });
  }

  async setActive(
    id: string,
    dto: UpdateUserStatusDto,
    actor: AuthenticatedUser,
  ): Promise<PublicUser> {
    if (isSelfMutation(actor.id, id))
      throw new BadRequestException('You cannot change your own active status');
    return this.mutate(id, { isActive: dto.isActive });
  }

  /**
   * Ordinary mutations are a single read + save. Only when the target is
   * currently an active admin and the change would strip that (demotion or
   * deactivation) does the write escalate to a transaction: the self-check
   * alone cannot stop two admins concurrently demoting or deactivating each
   * other, with both passing it and committing a zero-admin system.
   */
  private async mutate(id: string, change: UserChange): Promise<PublicUser> {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');
    if (!removesActiveAdmin(user, change)) {
      this.apply(user, change);
      await this.users.save(user);
      return serializeUser(user);
    }
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(User);
      // Lock-by-id first, join-free, so MySQL locks only the target row.
      const locked = await repository
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :id', { id })
        .getOne();
      if (!locked) throw new NotFoundException('User not found');
      // Re-checked under the lock: a concurrent transaction may already have
      // demoted or deactivated the target, making this an ordinary write.
      if (removesActiveAdmin(locked, change)) {
        // The COUNT must itself be a locking read — a plain COUNT reads this
        // transaction's REPEATABLE READ snapshot and can miss a concurrent
        // demotion committed before our lock was acquired.
        const activeAdmins = await repository
          .createQueryBuilder('user')
          .setLock('pessimistic_write')
          .where('user.role = :role', { role: UserRole.ADMIN })
          .andWhere('user.isActive = :isActive', { isActive: true })
          .getCount();
        if (activeAdmins <= 1)
          throw new BadRequestException(
            'At least one active admin account is required',
          );
      }
      this.apply(locked, change);
      await repository.save(locked);
      return serializeUser(locked);
    });
  }

  private apply(user: User, change: UserChange): void {
    Object.assign(
      user,
      change.role !== undefined ? { role: change.role } : {},
      change.isActive !== undefined ? { isActive: change.isActive } : {},
    );
  }
}
