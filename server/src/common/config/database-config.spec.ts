import { databaseConnectionOptions } from './database-config';

describe('databaseConnectionOptions', () => {
  const env = {
    DB_HOST: 'private.mysql', DB_PORT: '3306', DB_USERNAME: 'app',
    DB_PASSWORD: 'password', DB_NAME: 'shop', DB_SSL: 'true',
    DB_POOL_MAX: '7', DB_POOL_QUEUE_LIMIT: '25',
    DB_CONNECT_TIMEOUT_MS: '4000', DB_IDLE_TIMEOUT_MS: '30000',
    DB_SLOW_QUERY_MS: '750',
  };

  it('enables verified TLS, bounded pooling and real query timeouts', () => {
    const options = databaseConnectionOptions(env);
    expect(options.ssl).toMatchObject({ minVersion: 'TLSv1.2', rejectUnauthorized: true });
    expect(options.poolSize).toBe(7);
    expect(options.enableQueryTimeout).toBe(true);
    expect(options.maxQueryExecutionTime).toBe(750);
    expect(options.extra).toMatchObject({ connectionLimit: 7, queueLimit: 25, connectTimeout: 4000, idleTimeout: 30000 });
  });

  it('never silently enables insecure TLS', () => {
    expect(databaseConnectionOptions({ ...env, DB_SSL: 'false' }).ssl).toBeUndefined();
  });
});
