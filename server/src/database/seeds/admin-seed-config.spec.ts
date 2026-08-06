import { readAdminSeedConfig } from './admin-seed-config';

describe('readAdminSeedConfig', () => {
  it('skips admin creation when no credential is configured', () => {
    expect(readAdminSeedConfig({})).toBeUndefined();
  });

  it('normalizes an explicitly configured admin', () => {
    expect(
      readAdminSeedConfig({
        ADMIN_EMAIL: ' Owner@Example.com ',
        ADMIN_PASSWORD: 'a-strong-password',
        ADMIN_NAME: ' Store Owner ',
      }),
    ).toEqual({
      email: 'owner@example.com',
      password: 'a-strong-password',
      name: 'Store Owner',
    });
  });

  it('rejects a partial credential instead of guessing a default', () => {
    expect(() =>
      readAdminSeedConfig({ ADMIN_EMAIL: 'owner@example.com' }),
    ).toThrow(/provided together/);
  });

  it('rejects a weak password', () => {
    expect(() =>
      readAdminSeedConfig({
        ADMIN_EMAIL: 'owner@example.com',
        ADMIN_PASSWORD: 'short',
      }),
    ).toThrow(/at least 12/);
  });
});
