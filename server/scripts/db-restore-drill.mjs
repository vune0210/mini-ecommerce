import { spawn } from 'node:child_process';
import { argument, connectionArgs, databaseConfig, mysqlEnvironment } from './db-tools.mjs';

const source = databaseConfig();
const target = process.env.RESTORE_DRILL_DB_NAME;
const file = argument('--file');
if (!file || !target)
  throw new Error('Set RESTORE_DRILL_DB_NAME and pass --file <dump.sql.enc>');
if (target === source.database)
  throw new Error('RESTORE_DRILL_DB_NAME must differ from DB_NAME');

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

const drillEnv = { ...process.env, DB_NAME: target };
await run(process.execPath, ['scripts/db-restore.mjs', '--file', file, '--confirm', target], drillEnv);
const verifySql = [
  "SELECT IF(COUNT(*) >= 10, 'schema-ok', CONCAT('schema-too-small:', COUNT(*))) AS restore_check FROM information_schema.tables WHERE table_schema = DATABASE();",
  "SELECT COUNT(*) AS migration_count FROM migrations;",
  "SELECT COUNT(*) AS order_count FROM orders;",
  "SELECT COUNT(*) AS payment_count FROM payments;",
].join(' ');
await run(process.env.MYSQL_BIN ?? 'mysql', [...connectionArgs({ ...source, database: target }), target, '--execute', verifySql], mysqlEnvironment(source.password));
process.stdout.write(`Restore drill passed for disposable database ${target}. Drop it after review.\n`);
