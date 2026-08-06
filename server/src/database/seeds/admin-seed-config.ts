export type AdminSeedConfig = {
  email: string;
  password: string;
  name: string;
};

/**
 * Admin creation is opt-in. Container restarts must never recreate a public,
 * well-known credential, so an empty configuration means "skip the seed".
 */
export function readAdminSeedConfig(
  env: NodeJS.ProcessEnv,
): AdminSeedConfig | undefined {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;

  if (!email && !password) return undefined;
  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be provided together');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('ADMIN_EMAIL must be a valid email address');
  }
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error(
      'ADMIN_PASSWORD must be at least 12 characters and at most 72 UTF-8 bytes',
    );
  }

  const name = env.ADMIN_NAME?.trim() || 'Administrator';
  if (name.length > 100) {
    throw new Error('ADMIN_NAME must be at most 100 characters');
  }
  return { email, password, name };
}
