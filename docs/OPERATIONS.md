# Production operations

## Required deployment configuration

Production startup rejects placeholder/equal JWT secrets, insecure CORS origins,
an empty database password, and incomplete SMTP settings. Configure at least:

```text
NODE_ENV=production
DB_HOST=...
DB_PORT=4000
DB_USERNAME=...
DB_PASSWORD=...
DB_NAME=mini_ecommerce
DB_SSL=true
DB_SSL_CA_PATH=/run/secrets/mysql-ca.pem
DB_POOL_MAX=10
DB_POOL_QUEUE_LIMIT=50
DB_CONNECT_TIMEOUT_MS=10000
DB_IDLE_TIMEOUT_MS=60000
DB_SLOW_QUERY_MS=1000
JWT_ACCESS_SECRET=<48+ random characters>
JWT_REFRESH_SECRET=<different 48+ random characters>
FRONTEND_URL=https://shop.example.com
SMTP_HOST=...
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM=MiniShop <no-reply@shop.example.com>
TRUST_PROXY_HOPS=1
REQUEST_BODY_LIMIT_BYTES=1048576
SWAGGER_ENABLED=false
LOG_FORMAT=json
```

Use exact HTTPS origins. `CORS_ORIGINS` may contain a comma-separated list when
both apex and `www` domains are needed; `*` is rejected in production.

## Probes and shutdown

- `/api/health/live`: process-only liveness; never restart for a database outage.
- `/api/health/ready`: database plus pending-migration readiness; remove the
  instance from traffic on 503.
- `/api/health/info`: build/version identity, without credentials.
- Runtime containers run as a non-root user, never execute migrations, and give
  Nest 30 seconds to drain on SIGTERM. A single release job applies migrations
  before new replicas receive traffic.

## Database boundary and release job

- Never expose MySQL publicly. Local Compose binds `127.0.0.1:3306`; production
  uses the provider private hostname/network and no host port.
- Give the backend identity only `SELECT`, `INSERT`, `UPDATE`, `DELETE` on the
  application schema. It must not get `CREATE`, `ALTER`, `DROP`, `GRANT`,
  `FILE`, `PROCESS` or global privileges.
- Give a separate migration identity schema DDL only for the one-shot release
  job. Never put its credential in the long-running backend service.
- Managed production MySQL must enforce TLS. `DB_SSL_CA_PATH` points to a CA
  mounted at runtime; certificate verification remains enabled.

Managed-MySQL privilege template (replace names in the provider console; never
paste passwords into a shell history):

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON mini_ecommerce.* TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES
  ON mini_ecommerce.* TO app_migration;
GRANT SELECT, SHOW VIEW, TRIGGER, EVENT ON mini_ecommerce.* TO app_backup;
```

The local grant file runs only when MySQL initializes a fresh volume. For an
existing development volume, apply the equivalent grants once as root; do not
delete a volume merely to update permissions when it contains useful data.

Local release sequence:

```bash
docker compose --profile release run --rm release
docker compose up -d backend frontend
```

On a managed platform, run `npm run migration:run:prod` as a pre-deploy job and
deploy replicas only after it succeeds. Seed data explicitly when intended.

The runtime pool defaults to 10 connections per replica with a bounded waiting
queue. Keep `replicas × DB_POOL_MAX` below the database connection limit after
reserving capacity for migration, backup and operator access. Slow queries are
logged and the MySQL query timeout is enabled. Configure managed MySQL's
`innodb_lock_wait_timeout`, `innodb_rollback_on_timeout`, `max_execution_time`,
slow-query log and `long_query_time`; local Compose demonstrates safe defaults.

## Logs and incident triage

Production emits one JSON record per line. Search by `requestId`; the same ID is
returned in `X-Request-ID` and appears in error responses and admin audit rows.
Access records include method, path, status, duration and resolved client IP.
Passwords, tokens, cookies, authorization headers and credentials embedded in
URLs/messages are redacted.

For a 5xx incident:

1. Capture the response `requestId`, timestamp and endpoint.
2. Locate the matching `Exception` and `HTTP` log records.
3. Check `/health/ready` before restarting anything.
4. If a migration is pending, stop routing the new release and run the one-shot
   release job; replicas never apply it and `synchronize` stays disabled.
5. Roll back the application image only when the migration is backward
   compatible. Otherwise restore into a new database and test there first.

## Encrypted backup and restore drill

The commands require `mysqldump` and `mysql`. Passwords are passed only through
the child-process environment. Set `BACKUP_ENCRYPTION_KEY` to exactly 32 random
bytes encoded as base64. Dumps are AES-256-GCM encrypted before touching disk;
the JSON manifest stores IV, authentication tag, byte length and encrypted-file
SHA-256, never the key.

```bash
cd server
npm run backup:create
npm run backup:verify -- --file backups/<file>.sql.enc
```

Schedule `npm run backup:create` inside the deployment private network. Copy the
`.sql.enc` and `.json` pair to versioned durable object storage, apply retention
and alert on a missed or failed run. Do not expose MySQL to an external CI runner
for backups.

Restore is intentionally guarded by the exact target database name:

```bash
npm run backup:restore -- --file backups/<file>.sql.enc --confirm mini_ecommerce
```

Provision an empty disposable database and run the monthly drill:

```bash
RESTORE_DRILL_DB_NAME=mini_ecommerce_restore_drill \
  npm run backup:drill -- --file backups/<file>.sql.enc
```

The drill refuses the source database, restores and reports migration, order
and payment counts. Run smoke tests, record duration as measured RTO, then drop
the disposable database. A restore overwrites data logically and is never a
routine deploy step.

## Secret rotation checklist

1. Run `npm run security:scan-secrets` and inspect any redacted findings.
2. Generate two new, different JWT secrets; replacing them signs out all users.
3. Rotate SMTP credentials at the provider, update deployment variables, test a
   reset email, then revoke the old credential.
4. Rotate the database password in a maintenance window and update the backend
   immediately; verify `/health/ready` before reopening traffic.
5. Admin seed credentials are one-time bootstrap values. Remove
   `ADMIN_PASSWORD` after the account exists and change its password in-app.
6. Never put secrets in Git, screenshots, support tickets or command arguments.

## Release checklist

1. Unit tests, type-check, lint, client build and migrations pass.
2. Secret scan is clean.
3. Create and verify a database backup.
4. Deploy backend and wait for readiness.
5. Deploy frontend with the exact backend origin.
6. Smoke-test register/login/reset, catalogue, checkout, admin and cancellation.
7. Confirm logs contain request IDs and no credentials.
