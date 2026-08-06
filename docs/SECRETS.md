# Secret management runbook

## Boundaries

- Commit only `.env.example` files. Real `.env*`, private keys, database dumps,
  provider credentials and presigned URLs never belong in Git or an image.
- Every `VITE_*` value is public at build time. Only public configuration such
  as the API base URL or a Stripe publishable key may use that prefix.
- Development, staging and production use independent credentials and data.
- Production values come from the deployment platform's secret manager. Do not
  upload the root `.env` or `server/.env` to a production host.

## Local development

From `server/`, run `npm run secrets:generate-local` once. It creates the
ignored repository-root `.env` with independent random database and JWT values
and refuses to overwrite an existing file. Compose consumes that file.

`server/.env` remains the configuration for running Nest directly. Copy
`server/.env.example` and replace its placeholders locally.

## Staging and production

Create separate secret sets in Railway/Render environment variables, GitHub
Environments, AWS Secrets Manager, Cloudflare Secrets, Docker Secrets or
Kubernetes Secrets. Required sensitive values include `DB_PASSWORD`, both JWT
secrets, Stripe keys, SMTP password and object-storage credentials. Grant the
runtime identity read access only to its own environment.

Never pass a secret as a Docker `ARG`: build arguments and layers are not a
secret store. Inject secrets only when the container starts.

## Rotation

1. Create a new credential with least privilege while the old one still works.
2. Put the new value in the secret manager and deploy all consumers.
3. Verify readiness plus one real/sandbox operation using the new credential.
4. Revoke the old credential and monitor authentication failures.
5. Record actor, time, affected systems and verification in the change log.

For database rotation, create a new DB user, deploy it, then remove the old
user. For Stripe, rotate restricted API and webhook keys separately. Rotating
JWT keys invalidates sessions unless a multi-key verification window is
implemented; schedule it and revoke stored refresh sessions.

Rotate immediately after suspected exposure, staff access changes, unexpected
provider activity, or a secret appearing in a commit/log. Routine target:
90 days for long-lived credentials.

## Exposure response

Treat a committed or logged secret as compromised even after deleting it:

1. Revoke/rotate it first.
2. Review provider audit logs and preserve incident evidence.
3. Redeploy and verify the replacement.
4. Run `npm run security:scan-secrets` from `server/`.
5. Purge Git history/log retention only after revocation; deletion is not a
   substitute for rotation.
