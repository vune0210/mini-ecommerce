import { readFileSync } from 'node:fs';
import type { MysqlConnectionOptions } from 'typeorm/driver/mysql/MysqlConnectionOptions';

type Env = Record<string, string | undefined>;

export function databaseConnectionOptions(env: Env): Pick<MysqlConnectionOptions,
  'type' | 'host' | 'port' | 'username' | 'password' | 'database' | 'ssl' |
  'extra' | 'maxQueryExecutionTime' | 'logging' | 'enableQueryTimeout' | 'poolSize'> {
  const ssl = env.DB_SSL === 'true'
    ? {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
        ...(env.DB_SSL_CA_PATH
          ? { ca: readFileSync(env.DB_SSL_CA_PATH, 'utf8') }
          : {}),
      }
    : undefined;
  return {
    type: 'mysql',
    host: env.DB_HOST,
    port: Number(env.DB_PORT ?? 3306),
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl,
    logging: ['error'],
    maxQueryExecutionTime: Number(env.DB_SLOW_QUERY_MS ?? 1000),
    enableQueryTimeout: true,
    poolSize: Number(env.DB_POOL_MAX ?? 10),
    extra: {
      connectionLimit: Number(env.DB_POOL_MAX ?? 10),
      connectTimeout: Number(env.DB_CONNECT_TIMEOUT_MS ?? 10_000),
      waitForConnections: true,
      queueLimit: Number(env.DB_POOL_QUEUE_LIMIT ?? 50),
      maxIdle: Number(env.DB_POOL_MAX ?? 10),
      idleTimeout: Number(env.DB_IDLE_TIMEOUT_MS ?? 60_000),
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    },
  };
}
