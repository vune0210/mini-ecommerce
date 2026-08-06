import {
  corsOrigins,
  requestBodyLimitBytes,
  swaggerEnabled,
  trustProxyHops,
} from './http-config';

describe('HTTP config', () => {
  it('uses bounded production-friendly defaults', () => {
    expect(requestBodyLimitBytes({})).toBe(1_048_576);
    expect(trustProxyHops({ NODE_ENV: 'production' })).toBe(1);
    expect(swaggerEnabled({ NODE_ENV: 'production' })).toBe(false);
  });

  it('deduplicates exact CORS origins', () => {
    expect(
      corsOrigins({
        CORS_ORIGINS: 'https://a.example, https://a.example,https://b.example',
      }),
    ).toEqual(['https://a.example', 'https://b.example']);
  });
});
