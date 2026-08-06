import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import {
  argument,
  backupReadStream,
  connectionArgs,
  databaseConfig,
  mysqlEnvironment,
  verifyBackup,
} from './db-tools.mjs';

const config = databaseConfig();
const file = argument('--file');
if (!file)
  throw new Error(
    'Usage: npm run backup:restore -- --file <dump.sql> --confirm <DB_NAME>',
  );
if (argument('--confirm') !== config.database)
  throw new Error(`Refusing restore: pass --confirm ${config.database}`);

const verified = await verifyBackup(file);
const manifest = JSON.parse(await readFile(`${verified.absolute}.json`, 'utf8'));
process.stdout.write(
  `Verified ${verified.absolute} (${verified.bytes} bytes, ${verified.sha256})\n`,
);

const child = spawn(
  process.env.MYSQL_BIN ?? 'mysql',
  [...connectionArgs(config), config.database],
  {
    env: mysqlEnvironment(config.password),
    stdio: ['pipe', 'inherit', 'inherit'],
  },
);
await Promise.all([
  pipeline(backupReadStream(verified.absolute, manifest), child.stdin),
  new Promise((resolvePromise, reject) => {
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error(`mysql exited with code ${code}`)),
    );
  }),
]);
process.stdout.write(`Restore completed into database ${config.database}\n`);
