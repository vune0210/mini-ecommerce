export type DependencyStatus = { status: 'up' | 'down'; latencyMs?: number };

export type ReadinessChecks = {
  database: DependencyStatus;
  /** Schema is at the latest migration. A container that boots ahead of its
   *  migration step answers requests against a schema its code does not match. */
  migrations: { status: 'up' | 'down'; pending?: number };
};

/**
 * Ready only when every check is up. Deliberately total rather than
 * "database is enough": each check exists because something can serve traffic
 * while it is broken, which is exactly what readiness is for.
 */
export function readinessStatus(
  checks: ReadinessChecks,
): 'ready' | 'not-ready' {
  return checks.database.status === 'up' && checks.migrations.status === 'up'
    ? 'ready'
    : 'not-ready';
}

/**
 * Build identity, from the environment rather than a bundled package.json.
 * Reading the manifest at runtime means the compiled `dist` has to carry it and
 * the path differs between `nest start` and `node dist/main`; a deploy variable
 * has neither problem, and Railway/Vercel both set one for free.
 */
export function buildInfo(env: Record<string, string | undefined>): {
  version: string;
  commit: string | null;
  environment: string;
} {
  const commit =
    env.GIT_COMMIT ?? env.RAILWAY_GIT_COMMIT_SHA ?? env.VERCEL_GIT_COMMIT_SHA;
  return {
    version: env.APP_VERSION ?? 'unknown',
    // Short form: a full 40-char SHA in a health payload is noise, and the
    // first seven identify a commit unambiguously in any repo this size.
    commit: commit ? commit.slice(0, 7) : null,
    environment: env.NODE_ENV ?? 'development',
  };
}
