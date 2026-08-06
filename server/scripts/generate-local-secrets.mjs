import { randomBytes } from 'node:crypto';
import { access, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';

const target = resolve(import.meta.dirname, '..', '..', '.env');
try {
  await access(target, constants.F_OK);
  throw new Error('Root .env already exists; refusing to overwrite local secrets.');
} catch (error) {
  if (error instanceof Error && !('code' in error)) throw error;
  if (error?.code !== 'ENOENT') throw error;
}

const secret = () => randomBytes(48).toString('base64url');
const content = [
  '# Generated for local Docker only. Never commit or reuse outside development.',
  `DEV_DB_PASSWORD=${secret()}`,
  `DEV_DB_ROOT_PASSWORD=${secret()}`,
  `DEV_JWT_ACCESS_SECRET=${secret()}`,
  `DEV_JWT_REFRESH_SECRET=${secret()}`,
  '',
].join('\n');
await writeFile(target, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
process.stdout.write('Created untracked root .env with independent random local secrets.\n');
