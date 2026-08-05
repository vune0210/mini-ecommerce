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
  if (errors.length === 0) return config;

  // One throw listing everything, so a fresh clone is fixed in a single pass.
  const details = errors
    .map((error) => Object.values(error.constraints ?? {}).join('; '))
    .filter(Boolean)
    .join('\n  - ');
  throw new Error(`Invalid environment configuration:\n  - ${details}`);
}
