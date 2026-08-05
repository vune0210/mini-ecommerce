import { redactSecrets, REDACTED } from '../common/logging/log-rules';
import { UserRole } from '../users/entities/user.entity';
import {
  AUDIT_METADATA_KEYS,
  auditMetadata,
  deriveAction,
  deriveResourceType,
  isMutatingMethod,
  isSuccessStatus,
  resolveRoute,
  shouldAudit,
} from './audit-rules';

describe('isMutatingMethod', () => {
  it('accepts the state-changing verbs regardless of case', () => {
    for (const method of ['POST', 'patch', 'Put', 'DELETE'])
      expect(isMutatingMethod(method)).toBe(true);
  });

  it('rejects reads', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS'])
      expect(isMutatingMethod(method)).toBe(false);
  });
});

describe('isSuccessStatus', () => {
  it('counts 2xx and 3xx as an action taken', () => {
    expect(isSuccessStatus(200)).toBe(true);
    expect(isSuccessStatus(204)).toBe(true);
    expect(isSuccessStatus(302)).toBe(true);
  });

  it('does not count a rejected request', () => {
    expect(isSuccessStatus(400)).toBe(false);
    expect(isSuccessStatus(403)).toBe(false);
    expect(isSuccessStatus(500)).toBe(false);
  });
});

describe('shouldAudit', () => {
  const admin = {
    method: 'PATCH',
    statusCode: 200,
    role: UserRole.ADMIN as string,
  };

  it('records a successful admin mutation', () => {
    expect(shouldAudit(admin)).toBe(true);
  });

  it('ignores a customer doing the same thing', () => {
    expect(shouldAudit({ ...admin, role: UserRole.CUSTOMER })).toBe(false);
  });

  it('ignores an anonymous caller', () => {
    expect(shouldAudit({ ...admin, role: null })).toBe(false);
    expect(shouldAudit({ method: 'POST', statusCode: 201 })).toBe(false);
  });

  it('ignores reads', () => {
    expect(shouldAudit({ ...admin, method: 'GET' })).toBe(false);
  });

  it('ignores a failed handler — a rejected request is not an action', () => {
    expect(shouldAudit({ ...admin, statusCode: 403 })).toBe(false);
    expect(shouldAudit({ ...admin, statusCode: 500 })).toBe(false);
  });
});

describe('resolveRoute', () => {
  it('strips the global prefix and the admin mount point', () => {
    expect(resolveRoute('/api/admin/products', '/api/admin/products')).toEqual({
      segments: ['products'],
      resourceId: null,
    });
  });

  it('reads the id from the position the route pattern marks as a parameter', () => {
    expect(
      resolveRoute(
        '/api/admin/products/:id/stock',
        '/api/admin/products/summer-sale/stock',
      ),
    ).toEqual({
      segments: ['products', ':id', 'stock'],
      resourceId: 'summer-sale',
    });
  });

  it('takes the last parameter — the resource actually acted on', () => {
    expect(
      resolveRoute(
        '/api/products/:productId/reviews/:id',
        '/api/products/p-1/reviews/r-9',
      ),
    ).toEqual({
      segments: ['products', ':id', 'reviews', ':id'],
      resourceId: 'r-9',
    });
  });

  it('drops a query string', () => {
    expect(
      resolveRoute(undefined, '/api/admin/products/7?force=true').segments,
    ).toEqual(['products', ':id']);
  });

  it('falls back to id-shaped segments when no pattern is available', () => {
    expect(
      resolveRoute(
        undefined,
        '/api/admin/users/3f2504e0-4f89-41d3-9a0c-0305e82c3301/role',
      ),
    ).toEqual({
      segments: ['users', ':id', 'role'],
      resourceId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    });
  });

  it('ignores a pattern that does not line up with the url that matched it', () => {
    expect(
      resolveRoute('/api/admin/products/:id', '/api/admin/products'),
    ).toEqual({ segments: ['products'], resourceId: null });
  });

  it('drops an id too long for the column instead of truncating it', () => {
    const long = 'x'.repeat(40);
    expect(
      resolveRoute('/api/admin/products/:id', `/api/admin/products/${long}`)
        .resourceId,
    ).toBeNull();
  });
});

describe('deriveResourceType', () => {
  it('singularizes the collection owning the last parameter', () => {
    expect(deriveResourceType(['products', ':id'])).toBe('product');
    expect(deriveResourceType(['categories', ':id'])).toBe('category');
    expect(deriveResourceType(['addresses', ':id'])).toBe('address');
    expect(deriveResourceType(['stock-movements'])).toBe('stock-movement');
  });

  it('picks the nested collection, not the outer one', () => {
    expect(deriveResourceType(['products', ':id', 'reviews', ':id'])).toBe(
      'review',
    );
  });

  it('returns null when the path names no collection', () => {
    expect(deriveResourceType([])).toBeNull();
    expect(deriveResourceType([':id'])).toBeNull();
  });
});

describe('deriveAction', () => {
  const action = (method: string, routePath: string): string =>
    deriveAction(method, resolveRoute(routePath, routePath).segments);

  it('names the common admin mutations', () => {
    expect(action('POST', '/api/admin/products')).toBe('product.create');
    expect(action('PATCH', '/api/admin/products/:id')).toBe('product.update');
    expect(action('DELETE', '/api/admin/products/:id')).toBe('product.delete');
    expect(action('PUT', '/api/admin/products/:id')).toBe('product.replace');
  });

  it('treats a patched facet as a change to that facet', () => {
    expect(action('PATCH', '/api/admin/users/:id/role')).toBe(
      'user.role.change',
    );
    expect(action('PATCH', '/api/admin/users/:id/status')).toBe(
      'user.status.change',
    );
    expect(action('PATCH', '/api/admin/products/:id/stock')).toBe(
      'product.stock.change',
    );
    expect(action('PATCH', '/api/orders/:id/status')).toBe(
      'order.status.change',
    );
  });

  it('keeps sub-paths of a collection distinct', () => {
    expect(action('POST', '/api/admin/coupons/preview')).toBe(
      'coupon.preview.create',
    );
    expect(action('DELETE', '/api/reviews/:id/helpful')).toBe(
      'review.helpful.delete',
    );
  });

  it('is stable whether the pattern or the fallback produced the segments', () => {
    const pattern = resolveRoute(
      '/api/admin/users/:id/role',
      '/api/admin/users/3f2504e0-4f89-41d3-9a0c-0305e82c3301/role',
    );
    const fallback = resolveRoute(
      undefined,
      '/api/admin/users/3f2504e0-4f89-41d3-9a0c-0305e82c3301/role',
    );
    expect(deriveAction('PATCH', pattern.segments)).toBe(
      deriveAction('PATCH', fallback.segments),
    );
  });

  it('labels a path with no collection rather than inventing one', () => {
    expect(deriveAction('POST', [])).toBe('unknown.create');
  });
});

describe('auditMetadata', () => {
  it('keeps only allow-listed scalars', () => {
    expect(
      auditMetadata({
        role: 'ADMIN',
        isActive: false,
        stock: 12,
        note: null,
        // Not on the list — never recorded, however harmless it looks.
        email: 'victim@example.com',
        internalFlag: true,
      }),
    ).toEqual({ role: 'ADMIN', isActive: false, stock: 12, note: null });
  });

  it('never lets a credential through, listed key or not', () => {
    expect(
      auditMetadata({
        password: 'hunter2',
        refreshToken: 'jwt',
        code: 'SAVE10',
      }),
    ).toEqual({ code: 'SAVE10' });
  });

  it('drops an allow-listed key holding an object, which could hide one', () => {
    expect(
      auditMetadata({ role: { nested: { password: 'x' } }, name: 'ok' }),
    ).toEqual({ name: 'ok' });
  });

  it('agrees with the shared log redaction policy', () => {
    // The second gate is `redactSecrets`, so no allow-listed key may be one the
    // shared policy considers a credential — otherwise the column would fill
    // with '[redacted]' and the allow-list would be quietly lying about what it
    // captures. This fails the day someone adds e.g. 'token' to the list.
    for (const key of AUDIT_METADATA_KEYS)
      expect(redactSecrets({ [key]: 'value' })).toEqual({ [key]: 'value' });
    expect(REDACTED).toBe('[redacted]');
  });

  it('bounds free text', () => {
    const metadata = auditMetadata({ note: 'a'.repeat(500) });
    expect((metadata?.note as string).length).toBe(200);
  });

  it('returns null when nothing survives, so the column stays NULL', () => {
    expect(auditMetadata({ email: 'a@b.c' })).toBeNull();
    expect(auditMetadata(undefined)).toBeNull();
    expect(auditMetadata(null)).toBeNull();
    expect(auditMetadata('a string body')).toBeNull();
    expect(auditMetadata([{ role: 'ADMIN' }])).toBeNull();
  });
});
