/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
// The one spec that runs with the throttle rails ON.
//
// test/setup-env.ts disables them for every other spec — the suite registers
// and logs in dozens of accounts from a single address, which is precisely the
// pattern the limits exist to stop. Re-enabling here, before AppModule is
// compiled, is what keeps the guard itself covered rather than assumed.

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { resetDatabase } from './utils/db';

describe('Rate limiting e2e', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    process.env.RATE_LIMIT_DISABLED = 'false';
    // Loaded dynamically, and only after the flag is flipped:
    // `ConfigModule.forRoot()` reads the environment while app.module.ts is
    // being evaluated, not when the module is instantiated. A static import at
    // the top of this file is hoisted above beforeAll and would capture the
    // disabled flag that setup-env.ts sets for every other spec.
    //
    // Deliberately not jest.resetModules(): that clears the registry mid-run
    // and hands TypeORM a second, uninitialised copy of the mysql2 driver.
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
    process.env.RATE_LIMIT_DISABLED = 'true';
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
  });

  const api = () => request(app.getHttpServer());

  it('blocks a login brute force with 429 and a Retry-After', async () => {
    const attempt = () =>
      api()
        .post('/api/auth/login')
        .send({ email: 'nobody@test.local', password: 'WrongPass123!' });

    // The login rule is 10 per 15 minutes per caller.
    const results: number[] = [];
    for (let index = 0; index < 12; index += 1)
      results.push((await attempt()).status);

    expect(results.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(results.slice(10)).toEqual([429, 429]);

    const blocked = await attempt();
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.body.message).toContain('Too many requests');
    expect(blocked.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('leaves undecorated routes alone', async () => {
    // The catalogue is the bulk of real traffic and carries no @RateLimit, so
    // the global guard must be a pass-through for it.
    for (let index = 0; index < 30; index += 1)
      expect((await api().get('/api/products')).status).toBe(200);
  });

  it('counts each route separately', async () => {
    for (let index = 0; index < 11; index += 1)
      await api()
        .post('/api/auth/login')
        .send({ email: 'nobody@test.local', password: 'WrongPass123!' });

    // Register has its own budget: exhausting login must not close signups.
    const registered = await api().post('/api/auth/register').send({
      email: 'fresh-signup@test.local',
      password: 'Password123!',
      name: 'Fresh',
    });
    expect(registered.status).toBe(201);
  });
});
