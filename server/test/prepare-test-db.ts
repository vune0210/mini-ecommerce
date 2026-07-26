/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import 'dotenv/config';
import * as mysql from 'mysql2/promise';

async function prepare(): Promise<void> {
  const name = process.env.DB_NAME_TEST;
  if (!name) throw new Error('DB_NAME_TEST is required for e2e tests.');
  if (name === process.env.DB_NAME)
    throw new Error(
      'DB_NAME_TEST must not equal DB_NAME; refusing to touch the development database.',
    );
  if (!/^[A-Za-z0-9_]+$/.test(name))
    throw new Error(
      'DB_NAME_TEST may contain only letters, numbers, and underscores.',
    );
  process.env.DB_NAME = name;
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  });
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${name}\``);
  } finally {
    await connection.end();
  }
  // Import only after DB_NAME has been redirected to the isolated test schema.

  const dataSource = require('../src/database/data-source').default;
  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();
}
void prepare().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
