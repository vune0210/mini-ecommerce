/**
 * Framework-free error shaping. The HTTP filter owns transport concerns; every
 * decision about *what* the client sees lives here so it can be unit tested.
 */

export type DriverErrorMapping = { status: number; message: string };

/**
 * MySQL driver codes that mean something specific to a caller. Anything absent
 * is an internal fault and must not leak its message — a QueryFailedError text
 * carries table and column names.
 */
const DRIVER_ERRORS: Record<string, DriverErrorMapping> = {
  ER_DUP_ENTRY: {
    status: 409,
    message: 'A record with the same unique value already exists',
  },
  ER_ROW_IS_REFERENCED_2: {
    status: 409,
    message:
      'The record is still referenced by other data and cannot be deleted',
  },
  ER_NO_REFERENCED_ROW_2: {
    status: 400,
    message: 'A referenced record does not exist',
  },
  ER_DATA_TOO_LONG: {
    status: 400,
    message: 'A submitted value is too long for its field',
  },
};

export function mapDriverError(code: unknown): DriverErrorMapping | null {
  if (typeof code !== 'string') return null;
  return DRIVER_ERRORS[code] ?? null;
}

export type ErrorEnvelope = Record<string, unknown> & {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  requestId: string;
  timestamp: string;
};

export type ErrorEnvelopeInput = {
  status: number;
  /** Whatever `HttpException.getResponse()` returned, or a plain message. */
  payload: unknown;
  /** HTTP reason phrase used when the payload carries no `error`. */
  reason: string;
  path: string;
  requestId: string;
  timestamp: string;
};

/**
 * Existing clients read `body.message` (string or string[]) and, for the
 * insufficient-stock 409, `body.items`. Both must survive, so a structured
 * payload is spread through untouched and only observability fields are added.
 */
export function buildErrorEnvelope(input: ErrorEnvelopeInput): ErrorEnvelope {
  const carried: Record<string, unknown> =
    typeof input.payload === 'object' && input.payload !== null
      ? { ...(input.payload as Record<string, unknown>) }
      : {
          message:
            typeof input.payload === 'string' ? input.payload : input.reason,
        };

  const message = carried.message as string | string[] | undefined;

  return {
    ...carried,
    statusCode: input.status,
    error: typeof carried.error === 'string' ? carried.error : input.reason,
    message: message === undefined ? input.reason : message,
    path: input.path,
    requestId: input.requestId,
    timestamp: input.timestamp,
  };
}
