import {
  REDACTED,
  redactSecrets,
  redactTextSecrets,
  splitNestArgs,
  toLogLine,
} from './log-rules';

describe('redactSecrets', () => {
  it('masks credential-shaped keys regardless of case', () => {
    expect(
      redactSecrets({
        email: 'a@b.c',
        password: 'hunter2',
        AccessToken: 'jwt',
      }),
    ).toEqual({ email: 'a@b.c', password: REDACTED, AccessToken: REDACTED });
  });

  it('recurses into nested objects and arrays', () => {
    expect(redactSecrets({ users: [{ name: 'A', password: 'x' }] })).toEqual({
      users: [{ name: 'A', password: REDACTED }],
    });
  });

  it('stops at the depth bound instead of walking an entity graph forever', () => {
    const deep = { a: { b: { c: { d: { e: { f: 'too far' } } } } } };
    expect(redactSecrets(deep)).toEqual({
      a: { b: { c: { d: { e: '[truncated]' } } } },
    });
  });

  it('passes primitives through untouched', () => {
    expect(redactSecrets('plain')).toBe('plain');
    expect(redactSecrets(7)).toBe(7);
    expect(redactSecrets(null)).toBeNull();
  });

  it('normalizes separators in sensitive keys', () => {
    expect(
      redactSecrets({ DB_PASSWORD: 'db', 'set-cookie': 'session=abc' }),
    ).toEqual({ DB_PASSWORD: REDACTED, 'set-cookie': REDACTED });
  });
});

describe('redactTextSecrets', () => {
  it('masks bearer tokens, URL passwords and query-string secrets', () => {
    const value =
      'Bearer abc.def.ghi mysql://user:pass@host/db token=raw-value';
    const redacted = redactTextSecrets(value);
    expect(redacted).not.toContain('abc.def.ghi');
    expect(redacted).not.toContain(':pass@');
    expect(redacted).not.toContain('raw-value');
  });

  it('masks Stripe credentials embedded in free-form provider errors', () => {
    const value = `key sk_live_${'a'.repeat(32)} signature whsec_${'b'.repeat(32)}`;
    const redacted = redactTextSecrets(value);
    expect(redacted).not.toContain('sk_live_');
    expect(redacted).not.toContain('whsec_');
  });

  it('masks provider-specific credential keys', () => {
    expect(
      redactSecrets({
        stripe_signature: 'signature',
        clientSecret: 'oauth',
        secret_access_key: 'storage',
      }),
    ).toEqual({
      stripe_signature: REDACTED,
      clientSecret: REDACTED,
      secret_access_key: REDACTED,
    });
  });
});

describe('toLogLine', () => {
  it('emits a single JSON object', () => {
    expect(JSON.parse(toLogLine({ level: 'info', message: 'ok' }))).toEqual({
      level: 'info',
      message: 'ok',
    });
  });

  it('redacts on the way out', () => {
    const parsed = JSON.parse(toLogLine({ body: { password: 'x' } })) as {
      body: { password: string };
    };
    expect(parsed.body.password).toBe(REDACTED);
  });

  it('survives a cyclic record — the depth bound cuts the loop', () => {
    const cyclic: Record<string, unknown> = { level: 'error' };
    cyclic.self = cyclic;
    expect(() => toLogLine(cyclic)).not.toThrow();
    expect(toLogLine(cyclic)).toContain('[truncated]');
  });

  it('does not mistake a repeated sibling reference for a cycle', () => {
    const shared = { id: 'p1' };
    expect(JSON.parse(toLogLine({ a: shared, b: shared }))).toEqual({
      a: { id: 'p1' },
      b: { id: 'p1' },
    });
  });

  it('stringifies bigints', () => {
    const parsed = JSON.parse(toLogLine({ total: 10n })) as { total: string };
    expect(parsed.total).toBe('10');
  });
});

describe('splitNestArgs', () => {
  it('reads a lone trailing context', () => {
    expect(splitNestArgs(['ProductsService'])).toEqual({
      context: 'ProductsService',
    });
  });

  it('reads stack plus context', () => {
    expect(splitNestArgs(['Error: boom\n  at x', 'ProductsService'])).toEqual({
      stack: 'Error: boom\n  at x',
      context: 'ProductsService',
    });
  });

  it('ignores non-string arguments', () => {
    expect(splitNestArgs([{ id: 1 }])).toEqual({});
  });
});
