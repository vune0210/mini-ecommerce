import { validateEnv } from './env.validation';

const valid = {
  DB_HOST: 'localhost',
  DB_PORT: '3306',
  DB_USERNAME: 'mini_ecommerce',
  DB_PASSWORD: 'mini_ecommerce_password',
  DB_NAME: 'mini_ecommerce',
  JWT_ACCESS_SECRET: 'replace-with-a-long-access-secret',
  JWT_REFRESH_SECRET: 'replace-with-a-long-refresh-secret',
};

const production = {
  ...valid,
  NODE_ENV: 'production',
  DB_SSL: 'true',
  DB_PASSWORD: '9yF4Pz6vL2mQ8xT7cR5n',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
  FRONTEND_URL: 'https://shop.example.com',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: 'mailer',
  SMTP_PASSWORD: '7uR9mK4xP2cV8nL6qT5w',
  SMTP_FROM: 'MiniShop <no-reply@example.com>',
};

describe('validateEnv', () => {
  it('accepts the documented .env.example shape', () => {
    expect(() => validateEnv({ ...valid })).not.toThrow();
  });

  it('returns the config untouched so string reads keep working', () => {
    const config = { ...valid, PORT: '3000', SOMETHING_ELSE: 'kept' };
    expect(validateEnv(config)).toEqual(config);
    expect(validateEnv(config).DB_PORT).toBe('3306');
  });

  it('accepts an empty database password', () => {
    expect(() => validateEnv({ ...valid, DB_PASSWORD: '' })).not.toThrow();
  });

  it('rejects a non-numeric DB_PORT instead of silently yielding NaN', () => {
    expect(() => validateEnv({ ...valid, DB_PORT: 'three-thousand' })).toThrow(
      /DB_PORT must be numeric/,
    );
  });

  it('rejects a short JWT secret', () => {
    expect(() => validateEnv({ ...valid, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /JWT_ACCESS_SECRET must be at least 16 characters/,
    );
  });

  it('reports every problem in one throw', () => {
    let message = '';
    try {
      validateEnv({ ...valid, DB_HOST: '', JWT_REFRESH_SECRET: 'x' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/DB_HOST/);
    expect(message).toMatch(/JWT_REFRESH_SECRET/);
  });

  it('reports a missing required variable', () => {
    const withoutDbName: Record<string, unknown> = { ...valid };
    delete withoutDbName.DB_NAME;
    expect(() => validateEnv(withoutDbName)).toThrow(/DB_NAME/);
  });

  it('treats optional variables as optional', () => {
    expect(() =>
      validateEnv({ ...valid, PORT: undefined, FRONTEND_URL: undefined }),
    ).not.toThrow();
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });

  it('accepts a complete SMTP configuration', () => {
    expect(() =>
      validateEnv({
        ...valid,
        FRONTEND_URL: 'https://shop.example.com',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '587',
        SMTP_SECURE: 'false',
        SMTP_USER: 'mailer',
        SMTP_PASSWORD: 'secret',
        SMTP_FROM: 'MiniShop <no-reply@example.com>',
      }),
    ).not.toThrow();
  });

  it('rejects a partial SMTP configuration', () => {
    expect(() =>
      validateEnv({ ...valid, SMTP_HOST: 'smtp.example.com' }),
    ).toThrow(/SMTP_PORT.*SMTP_USER.*SMTP_PASSWORD.*SMTP_FROM.*FRONTEND_URL/);
  });

  it('accepts strong production configuration', () => {
    expect(() => validateEnv(production)).not.toThrow();
  });

  it('rejects equal or placeholder production JWT secrets', () => {
    expect(() =>
      validateEnv({
        ...production,
        JWT_ACCESS_SECRET: 'replace-with-a-long-production-secret',
      }),
    ).toThrow(/must not be placeholders/);
    expect(() =>
      validateEnv({
        ...production,
        JWT_REFRESH_SECRET: production.JWT_ACCESS_SECRET,
      }),
    ).toThrow(/must be different/);
  });

  it('rejects weak production database and SMTP credentials', () => {
    expect(() =>
      validateEnv({ ...production, DB_PASSWORD: 'password' }),
    ).toThrow(/Production DB_PASSWORD/);
    expect(() =>
      validateEnv({ ...production, SMTP_PASSWORD: 'replace-me' }),
    ).toThrow(/Production SMTP_PASSWORD/);
  });

  it('validates configured Stripe secrets in production', () => {
    expect(() =>
      validateEnv({
        ...production,
        STRIPE_SECRET_KEY: `sk_test_${'a'.repeat(32)}`,
        STRIPE_WEBHOOK_SECRET: `whsec_${'b'.repeat(32)}`,
      }),
    ).not.toThrow();
    expect(() =>
      validateEnv({
        ...production,
        STRIPE_SECRET_KEY: 'not-a-secret-key',
        STRIPE_WEBHOOK_SECRET: `whsec_${'b'.repeat(32)}`,
      }),
    ).toThrow(/STRIPE_SECRET_KEY/);
  });

  it('rejects wildcard or insecure production CORS origins', () => {
    expect(() => validateEnv({ ...production, CORS_ORIGINS: '*' })).toThrow(
      /exact HTTPS origins/,
    );
    expect(() =>
      validateEnv({ ...production, FRONTEND_URL: 'http://shop.example.com' }),
    ).toThrow(/exact HTTPS origins/);
  });

  it('bounds body limits and trusted proxy hops', () => {
    expect(() =>
      validateEnv({ ...valid, REQUEST_BODY_LIMIT_BYTES: '100' }),
    ).toThrow(/REQUEST_BODY_LIMIT_BYTES/);
    expect(() => validateEnv({ ...valid, TRUST_PROXY_HOPS: '99' })).toThrow(
      /TRUST_PROXY_HOPS/,
    );
  });

  it('bounds database pool and timeout settings', () => {
    expect(() => validateEnv({ ...valid, DB_POOL_MAX: '0' })).toThrow(/DB_POOL_MAX/);
    expect(() => validateEnv({ ...valid, DB_CONNECT_TIMEOUT_MS: '999' })).toThrow(/DB_CONNECT_TIMEOUT_MS/);
    expect(() => validateEnv({ ...valid, DB_SLOW_QUERY_MS: '60001' })).toThrow(/DB_SLOW_QUERY_MS/);
  });

  it('requires TLS for a production database connection', () => {
    expect(() => validateEnv({ ...production, DB_SSL: 'false' })).toThrow(/DB_SSL=true/);
  });
});
