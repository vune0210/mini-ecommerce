import { argument, verifyBackup } from './db-tools.mjs';

const file = argument('--file');
if (!file) throw new Error('Usage: npm run backup:verify -- --file <dump.sql>');
const result = await verifyBackup(file);
process.stdout.write(
  `Backup verified: ${result.absolute} (${result.bytes} bytes, ${result.sha256})\n`,
);
