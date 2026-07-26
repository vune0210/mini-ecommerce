import { REDACTED, redactSecrets, splitNestArgs, toLogLine } from './log-rules';

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
