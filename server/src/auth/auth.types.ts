import { UserRole } from '../users/entities/user.entity';

export type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
  type: 'access' | 'refresh';
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};
