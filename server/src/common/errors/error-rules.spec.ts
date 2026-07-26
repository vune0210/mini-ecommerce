import { buildErrorEnvelope, mapDriverError } from './error-rules';

const base = {
  reason: 'Bad Request',
  path: '/api/products',
  requestId: 'req-1',
  timestamp: '2026-07-26T00:00:00.000Z',
};

describe('mapDriverError', () => {
  it('translates the duplicate-key code to 409', () => {
    expect(mapDriverError('ER_DUP_ENTRY')).toEqual({
      status: 409,
      message: 'A record with the same unique value already exists',
    });
  });

  it('translates the referenced-row code to 409', () => {
    expect(mapDriverError('ER_ROW_IS_REFERENCED_2')?.status).toBe(409);
  });

  it('returns null for unknown or non-string codes', () => {
    expect(mapDriverError('ER_SOMETHING_ELSE')).toBeNull();
    expect(mapDriverError(undefined)).toBeNull();
    expect(mapDriverError(1451)).toBeNull();
  });
});

describe('buildErrorEnvelope', () => {
  it('keeps a plain string message', () => {
    const body = buildErrorEnvelope({
      ...base,
      status: 404,
      payload: 'Product not found',
    });
    expect(body.message).toBe('Product not found');
    expect(body.statusCode).toBe(404);
    expect(body.error).toBe('Bad Request');
  });

  it('keeps the ValidationPipe string array intact', () => {
    const body = buildErrorEnvelope({
      ...base,
      status: 400,
      payload: {
        statusCode: 400,
        message: ['price must be positive'],
        error: 'Bad Request',
      },
    });
    expect(body.message).toEqual(['price must be positive']);
  });

  it('carries extra payload keys through — the stock conflict relies on `items`', () => {
    const body = buildErrorEnvelope({
      ...base,
      status: 409,
      reason: 'Conflict',
      payload: {
        message: 'Insufficient stock for one or more items',
        items: [{ productName: 'Mug', requested: 3, available: 1 }],
      },
    });
    expect(body.items).toEqual([
      { productName: 'Mug', requested: 3, available: 1 },
    ]);
    expect(body.message).toBe('Insufficient stock for one or more items');
  });

  it('adds the observability fields without overwriting the payload', () => {
    const body = buildErrorEnvelope({
      ...base,
      status: 500,
      payload: null,
      reason: 'Internal Server Error',
    });
    expect(body).toMatchObject({
      statusCode: 500,
      message: 'Internal Server Error',
      path: '/api/products',
      requestId: 'req-1',
      timestamp: '2026-07-26T00:00:00.000Z',
    });
  });

  it('prefers an error label supplied by the payload', () => {
    const body = buildErrorEnvelope({
      ...base,
      status: 403,
      payload: { message: 'Nope', error: 'Forbidden' },
    });
    expect(body.error).toBe('Forbidden');
  });
});
