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
});
