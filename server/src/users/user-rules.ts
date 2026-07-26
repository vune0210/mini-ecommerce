import { User, UserRole } from './entities/user.entity';

/** The admin-list projection of a user. Never carries the password hash. */
export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Admins may never change their own role or active flag — in either
 * direction. Total on purpose: even a self "promotion" to the role already
 * held is rejected, so the rail needs no knowledge of the requested values.
 * The service maps a hit to BadRequestException.
 */
export function isSelfMutation(actorId: string, targetId: string): boolean {
  return actorId === targetId;
}

/**
 * True when applying `change` to `target` would turn a currently active
 * admin into a non-admin or inactive account. This is the branch condition
 * for the transactional zero-active-admin guard: only mutations for which
 * this returns true take the FOR UPDATE lock and count active admins.
 * Ordinary customer mutations stay single-query.
 */
export function removesActiveAdmin(
  target: Pick<User, 'role' | 'isActive'>,
  change: { role?: UserRole; isActive?: boolean },
): boolean {
  if (target.role !== UserRole.ADMIN || !target.isActive) return false;
  if (change.role !== undefined && change.role !== UserRole.ADMIN) return true;
  return change.isActive === false;
}

/**
 * The one projection the admin user list returns. Field-by-field on purpose —
 * spreading the entity would leak the password hash the moment a query path
 * selects it. Admin surfaces deliberately expose email.
 */
export function serializeUser(
  user: Pick<
    User,
    'id' | 'email' | 'name' | 'role' | 'isActive' | 'createdAt' | 'updatedAt'
  >,
): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
