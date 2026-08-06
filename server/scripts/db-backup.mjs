import { spawn } from 'node:child_process';
import { createCipheriv, randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  connectionArgs,
  backupEncryptionKey,
  databaseConfig,
  mysqlEnvironment,
  sha256File,
} from './db-tools.mjs';

const config = databaseConfig();
const outputDirectory = resolve(process.env.BACKUP_DIR ?? './backups');
await mkdir(outputDirectory, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const finalPath = join(outputDirectory, `${config.database}-${stamp}.sql.enc`);
const partialPath = `${finalPath}.partial`;

const args = [
  ...connectionArgs(config),
  '--single-transaction',
  '--quick',
  '--skip-lock-tables',
  '--no-tablespaces',
  '--hex-blob',
  config.database,
];

try {
  const output = createWriteStream(partialPath, { flags: 'wx' });
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', backupEncryptionKey(), iv);
  const child = spawn(process.env.MYSQLDUMP_BIN ?? 'mysqldump', args, {
    env: mysqlEnvironment(config.password),
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await Promise.all([
    pipeline(child.stdout, cipher, output),
    new Promise((resolvePromise, reject) => {
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolvePromise();
        else reject(new Error(`mysqldump exited with code ${code}`));
      });
    }),
  ]);
  await rename(partialPath, finalPath);
  const info = await stat(finalPath);
  const manifest = {
    version: 2,
    database: config.database,
    createdAt: new Date().toISOString(),
    bytes: info.size,
    sha256: await sha256File(finalPath),
    encryption: {
      algorithm: 'aes-256-gcm',
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    },
  };
  await writeFile(
    `${finalPath}.json`,
    `${JSON.stringify(manifest, null, 2)}\n`,
    {
      flag: 'wx',
    },
  );
  process.stdout.write(`Backup created: ${finalPath}\n`);
  process.stdout.write(`SHA-256: ${manifest.sha256}\n`);
} catch (error) {
  await rm(partialPath, { force: true });
  throw error;
}
