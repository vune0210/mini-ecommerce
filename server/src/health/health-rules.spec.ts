import { buildInfo, readinessStatus } from './health-rules';

describe('readinessStatus', () => {
  it('is ready only when every check is up', () => {
    expect(
      readinessStatus({
        database: { status: 'up' },
        migrations: { status: 'up', pending: 0 },
      }),
    ).toBe('ready');
  });

  it('is not ready when the database is down', () => {
    expect(
      readinessStatus({
        database: { status: 'down' },
        migrations: { status: 'up', pending: 0 },
      }),
    ).toBe('not-ready');
  });

  /** A container running ahead of its migration step must not take traffic. */
  it('is not ready when migrations are pending', () => {
    expect(
      readinessStatus({
        database: { status: 'up' },
        migrations: { status: 'down', pending: 2 },
      }),
    ).toBe('not-ready');
  });
});

describe('buildInfo', () => {
  it('reads the version and shortens the commit', () => {
    expect(
      buildInfo({
        APP_VERSION: '1.4.0',
        GIT_COMMIT: 'b3a34681f0c2d9e4a5b6c7d8e9f0a1b2c3d4e5f6',
        NODE_ENV: 'production',
      }),
    ).toEqual({
      version: '1.4.0',
      commit: 'b3a3468',
      environment: 'production',
    });
  });

  it('falls back to the platform commit variables', () => {
    expect(buildInfo({ RAILWAY_GIT_COMMIT_SHA: 'abcdef1234' }).commit).toBe(
      'abcdef1',
    );
    expect(buildInfo({ VERCEL_GIT_COMMIT_SHA: 'fedcba9876' }).commit).toBe(
      'fedcba9',
    );
  });

  it('says unknown rather than guessing', () => {
    expect(buildInfo({})).toEqual({
      version: 'unknown',
      commit: null,
      environment: 'development',
    });
  });
});
