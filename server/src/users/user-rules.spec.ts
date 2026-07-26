import { UserRole } from './entities/user.entity';
import {
  isSelfMutation,
  removesActiveAdmin,
  serializeUser,
} from './user-rules';
describe('user rules', () => {
  it('flags a self mutation in both directions, regardless of the change', () => {
    expect(isSelfMutation('user-1', 'user-1')).toBe(true);
    expect(isSelfMutation('user-1', 'user-2')).toBe(false);
    expect(isSelfMutation('user-2', 'user-1')).toBe(false);
  });
  it('detects demoting or deactivating a currently active admin', () => {
    expect(
      removesActiveAdmin(
        { role: UserRole.ADMIN, isActive: true },
        { role: UserRole.CUSTOMER },
      ),
    ).toBe(true);
    expect(
      removesActiveAdmin(
        { role: UserRole.ADMIN, isActive: true },
        { isActive: false },
      ),
    ).toBe(true);
    // Both at once is still a single reduction, not a bypass.
    expect(
      removesActiveAdmin(
        { role: UserRole.ADMIN, isActive: true },
        { role: UserRole.CUSTOMER, isActive: false },
      ),
    ).toBe(true);
  });
  it('ignores changes that keep an active admin active', () => {
    expect(
      removesActiveAdmin({ role: UserRole.ADMIN, isActive: true }, {}),
    ).toBe(false);
    expect(
      removesActiveAdmin(
        { role: UserRole.ADMIN, isActive: true },
        { role: UserRole.ADMIN, isActive: true },
      ),
    ).toBe(false);
  });
  it('ignores targets that are not currently active admins', () => {
    // Already inactive: deactivating or demoting cannot reduce the count.
    expect(
      removesActiveAdmin(
        { role: UserRole.ADMIN, isActive: false },
        { role: UserRole.CUSTOMER },
      ),
    ).toBe(false);
    expect(
      removesActiveAdmin(
        { role: UserRole.CUSTOMER, isActive: true },
        { isActive: false },
      ),
    ).toBe(false);
    // Promoting an inactive user to admin only ever grows the count.
    expect(
      removesActiveAdmin(
        { role: UserRole.CUSTOMER, isActive: false },
        { role: UserRole.ADMIN },
      ),
    ).toBe(false);
  });
  it('serializes exactly the public admin-list shape', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');
    expect(
      serializeUser({
        id: 'user-1',
        email: 'customer@example.com',
        name: 'Customer',
        role: UserRole.CUSTOMER,
        isActive: true,
        createdAt,
        updatedAt,
      }),
    ).toEqual({
      id: 'user-1',
      email: 'customer@example.com',
      name: 'Customer',
      role: UserRole.CUSTOMER,
      isActive: true,
      createdAt,
      updatedAt,
    });
  });
  it('never carries the password hash through, even when selected', () => {
    const row = {
      id: 'user-2',
      email: 'admin@example.com',
      name: 'Admin',
      role: UserRole.ADMIN,
      isActive: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      password: '$2b$12$not-a-real-hash',
    };
    expect(serializeUser(row)).not.toHaveProperty('password');
  });
});
