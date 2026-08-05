/**
 * Redirects the e2e run onto its own schema.
 *
 * This MUST run before any module is loaded. Written at the top of a spec file
 * it does not: ts-jest compiles `import` to a hoisted `require`, so the guard
 * executed after the whole module graph — and `src/database/data-source.ts`
 * reads `process.env.DB_NAME` at module scope. One spec importing it (directly
 * or transitively) would point the suite at the developer's real database,
 * which `beforeEach` then empties table by table.
 *
 * Jest's `setupFiles` is the one hook that runs before the module registry is
 * touched, so the redirect lives here and is enforced for every spec rather
 * than copy-pasted into each one.
 */
export {}; // Without this the file is a script and its consts land in global scope.

const testSchema = process.env.DB_NAME_TEST;

if (!testSchema) throw new Error('DB_NAME_TEST is required for e2e tests.');
if (testSchema === process.env.DB_NAME)
  throw new Error(
    'DB_NAME_TEST must not equal DB_NAME; refusing to touch the development database.',
  );
if (!/^[A-Za-z0-9_]+$/.test(testSchema))
  throw new Error(
    'DB_NAME_TEST may contain only letters, numbers, and underscores.',
  );

process.env.DB_NAME = testSchema;

/**
 * The suite registers and logs in dozens of accounts from one address, which
 * is exactly the pattern the auth rate limits exist to stop. Left on, the
 * specs would be measuring the limiter instead of the behaviour under test.
 *
 * `??=` rather than a plain assignment so rate-limit.e2e-spec.ts can opt back
 * in by setting the variable before jest loads this file.
 */
process.env.RATE_LIMIT_DISABLED ??= 'true';
