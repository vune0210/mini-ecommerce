import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from 'class-validator';

/**
 * Declares what the process needs to boot. Before this existed, a missing or
 * malformed variable surfaced one at a time from scattered `getOrThrow` calls
 * during module init — and a non-numeric DB_PORT became a silent NaN.
 */
export class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'test', 'production'])
  NODE_ENV?: string;

  @IsOptional()
  @IsNumberString({}, { message: 'PORT must be numeric' })
  PORT?: string;

  @IsString()
  @IsNotEmpty()
  DB_HOST: string;

  @IsNumberString({}, { message: 'DB_PORT must be numeric' })
  DB_PORT: string;

  @IsString()
  @IsNotEmpty()
  DB_USERNAME: string;

  /** Deliberately allowed to be empty — some local MySQL setups have no password. */
  @IsString()
  DB_PASSWORD: string;

  @IsString()
  @IsNotEmpty()
  DB_NAME: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  DB_SSL?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  DB_SSL_CA_PATH?: string;

  @IsOptional()
  @IsNumberString()
  DB_POOL_MAX?: string;

  @IsOptional()
  @IsNumberString()
  DB_CONNECT_TIMEOUT_MS?: string;

  @IsOptional()
  @IsNumberString()
  DB_POOL_QUEUE_LIMIT?: string;

  @IsOptional()
  @IsNumberString()
  DB_IDLE_TIMEOUT_MS?: string;

  @IsOptional()
  @IsNumberString()
  DB_SLOW_QUERY_MS?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  SMTP_HOST?: string;

  @IsOptional()
  @IsNumberString({}, { message: 'SMTP_PORT must be numeric' })
  SMTP_PORT?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  SMTP_SECURE?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  SMTP_PASSWORD?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  SMTP_FROM?: string;

  @IsString()
  @MinLength(16, {
    message: 'JWT_ACCESS_SECRET must be at least 16 characters',
  })
  JWT_ACCESS_SECRET: string;

  @IsString()
  @MinLength(16, {
    message: 'JWT_REFRESH_SECRET must be at least 16 characters',
  })
  JWT_REFRESH_SECRET: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  FRONTEND_URL?: string;

  @IsOptional()
  @IsIn(['json', 'pretty'])
  LOG_FORMAT?: string;

  @IsOptional()
  @IsNumberString({}, { message: 'REQUEST_BODY_LIMIT_BYTES must be numeric' })
  REQUEST_BODY_LIMIT_BYTES?: string;

  @IsOptional()
  @IsNumberString({}, { message: 'TRUST_PROXY_HOPS must be numeric' })
  TRUST_PROXY_HOPS?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  CORS_ORIGINS?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  SWAGGER_ENABLED?: string;

  /**
   * Delivery pricing. Left unset, orders ship free and totals are identical to
   * a deployment that predates shipping fees — so enabling the charge is an
   * explicit business decision, never an upgrade side effect.
   */
  @IsOptional()
  @IsNumberString({}, { message: 'SHIPPING_FLAT_FEE must be numeric' })
  SHIPPING_FLAT_FEE?: string;

  @IsOptional()
  @IsNumberString({}, { message: 'FREE_SHIPPING_THRESHOLD must be numeric' })
  FREE_SHIPPING_THRESHOLD?: string;

  /**
   * Turns off every @RateLimit rail. Exists for the e2e suite and load tests,
   * which drive hundreds of logins from one address and would otherwise be
   * measuring the limiter. Never set it in a deployment.
   */
  @IsOptional()
  @IsIn(['true', 'false'])
  RATE_LIMIT_DISABLED?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  STRIPE_SECRET_KEY?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  STRIPE_WEBHOOK_SECRET?: string;
}

/**
 * Returns the config unchanged. Validation must not rewrite values: the rest of
 * the app reads these through `ConfigService.getOrThrow<string>()` and through
 * bare `process.env`, and a coerced type would diverge between the two.
 */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(parsed, { skipMissingProperties: false });
  if (errors.length > 0) {
    // One throw listing everything, so a fresh clone is fixed in a single pass.
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join('; '))
      .filter(Boolean)
      .join('\n  - ');
    throw new Error(`Invalid environment configuration:\n  - ${details}`);
  }

  const smtpKeys = [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_FROM',
  ] as const;
  const smtpConfigured = smtpKeys.some((key) => Boolean(config[key]));
  if (smtpConfigured) {
    const missing: string[] = smtpKeys.filter((key) => !config[key]);
    if (!config.FRONTEND_URL) missing.push('FRONTEND_URL');
    if (missing.length > 0) {
      throw new Error(
        `Invalid SMTP configuration: missing ${missing.join(', ')}`,
      );
    }
  }
  const stripeConfigured = Boolean(config.STRIPE_SECRET_KEY || config.STRIPE_WEBHOOK_SECRET);
  if (stripeConfigured && (!config.STRIPE_SECRET_KEY || !config.STRIPE_WEBHOOK_SECRET))
    throw new Error('Invalid Stripe configuration: STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are both required');

  validateNumericRanges(config);
  if (config.NODE_ENV === 'production') validateProduction(config);
  return config;
}

function validateNumericRanges(config: Record<string, unknown>): void {
  const bodyLimit = Number(config.REQUEST_BODY_LIMIT_BYTES ?? 1_048_576);
  if (bodyLimit < 1024 || bodyLimit > 10 * 1024 * 1024)
    throw new Error(
      'REQUEST_BODY_LIMIT_BYTES must be between 1024 and 10485760',
    );
  const proxyHops = Number(config.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 10)
    throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 10');
  numericRange(config, 'DB_POOL_MAX', 1, 100, 10);
  numericRange(config, 'DB_CONNECT_TIMEOUT_MS', 1000, 60000, 10000);
  numericRange(config, 'DB_POOL_QUEUE_LIMIT', 1, 10000, 50);
  numericRange(config, 'DB_IDLE_TIMEOUT_MS', 1000, 300000, 60000);
  numericRange(config, 'DB_SLOW_QUERY_MS', 50, 60000, 1000);
}

function numericRange(config: Record<string, unknown>, key: string, min: number, max: number, fallback: number): void {
  const value = Number(config[key] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${key} must be an integer between ${min} and ${max}`);
}

function validateProduction(config: Record<string, unknown>): void {
  const access =
    typeof config.JWT_ACCESS_SECRET === 'string'
      ? config.JWT_ACCESS_SECRET
      : '';
  const refresh =
    typeof config.JWT_REFRESH_SECRET === 'string'
      ? config.JWT_REFRESH_SECRET
      : '';
  const weak = /change|replace|example|default|secret/i;
  if (
    access.length < 32 ||
    refresh.length < 32 ||
    weak.test(access) ||
    weak.test(refresh)
  )
    throw new Error(
      'Production JWT secrets must be at least 32 characters and must not be placeholders',
    );
  if (access === refresh)
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different',
    );
  if (!config.DB_PASSWORD)
    throw new Error('DB_PASSWORD must not be empty in production');
  const dbPassword = String(config.DB_PASSWORD);
  if (dbPassword.length < 16 || weak.test(dbPassword))
    throw new Error(
      'Production DB_PASSWORD must be at least 16 characters and must not be a placeholder',
    );
  if (config.DB_SSL !== 'true')
    throw new Error('DB_SSL=true is required in production');

  const configuredOrigins =
    typeof config.CORS_ORIGINS === 'string'
      ? config.CORS_ORIGINS
      : typeof config.FRONTEND_URL === 'string'
        ? config.FRONTEND_URL
        : '';
  const origins = configuredOrigins
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (origins.length === 0)
    throw new Error('FRONTEND_URL or CORS_ORIGINS is required in production');
  for (const origin of origins) {
    if (origin === '*' || new URL(origin).protocol !== 'https:')
      throw new Error('Production CORS origins must be exact HTTPS origins');
  }

  const smtpRequired = [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_FROM',
  ];
  const missingSmtp = smtpRequired.filter((key) => !config[key]);
  if (missingSmtp.length)
    throw new Error(
      `Production SMTP configuration is missing ${missingSmtp.join(', ')}`,
    );
  const smtpPassword = String(config.SMTP_PASSWORD ?? '');
  if (smtpPassword.length < 16 || weak.test(smtpPassword))
    throw new Error(
      'Production SMTP_PASSWORD must be at least 16 characters and must not be a placeholder',
    );

  if (config.STRIPE_SECRET_KEY || config.STRIPE_WEBHOOK_SECRET) {
    if (!/^sk_(?:test|live)_[A-Za-z0-9]{16,}$/.test(String(config.STRIPE_SECRET_KEY)))
      throw new Error('STRIPE_SECRET_KEY has an invalid Stripe secret-key format');
    if (!/^whsec_[A-Za-z0-9]{20,}$/.test(String(config.STRIPE_WEBHOOK_SECRET)))
      throw new Error('STRIPE_WEBHOOK_SECRET has an invalid Stripe webhook-secret format');
  }
}
