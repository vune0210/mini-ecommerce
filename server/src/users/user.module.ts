import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshSession } from '../auth/entities/refresh-session.entity';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, RefreshSession])],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UserModule {}
