export function requestBodyLimitBytes(env: NodeJS.ProcessEnv): number {
  return Number(env.REQUEST_BODY_LIMIT_BYTES ?? 1_048_576);
}

export function trustProxyHops(env: NodeJS.ProcessEnv): number {
  return Number(
    env.TRUST_PROXY_HOPS ?? (env.NODE_ENV === 'production' ? 1 : 0),
  );
}

export function corsOrigins(env: NodeJS.ProcessEnv): string[] {
  const raw = env.CORS_ORIGINS ?? env.FRONTEND_URL ?? 'http://localhost:5173';
  return [
    ...new Set(
      raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

export function swaggerEnabled(env: NodeJS.ProcessEnv): boolean {
  if (env.SWAGGER_ENABLED !== undefined) return env.SWAGGER_ENABLED === 'true';
  return env.NODE_ENV !== 'production';
}
