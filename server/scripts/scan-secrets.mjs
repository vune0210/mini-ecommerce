import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const patterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['openai-key', /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ['google-api-key', /\bAIza[A-Za-z0-9_-]{30,}\b/],
  ['stripe-live-key', /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/],
  ['stripe-webhook-secret', /\bwhsec_[A-Za-z0-9]{20,}\b/],
  ['sendgrid-key', /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{20,}\b/],
  ['mailgun-key', /\bkey-[A-Za-z0-9]{24,}\b/],
];
const skippedExtensions = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.pdf',
]);

function findingsIn(text, source) {
  const findings = [];
  for (const [kind, pattern] of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const line = text.slice(0, match.index).split('\n').length;
    findings.push({ source, line, kind });
  }
  return findings;
}

const gitSafeRoot = root.replaceAll('\\', '/');
const gitPrefix = ['-c', `safe.directory=${gitSafeRoot}`];
const files = execFileSync(
  'git',
  [
    ...gitPrefix,
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
  ],
  {
    cwd: root,
    encoding: 'utf8',
  },
)
  .split('\0')
  .filter(Boolean);
const findings = [];
for (const file of files) {
  if (
    file.endsWith('package-lock.json') ||
    skippedExtensions.has(extname(file))
  )
    continue;
  try {
    findings.push(
      ...findingsIn(await readFile(resolve(root, file), 'utf8'), file),
    );
  } catch {
    // Binary or concurrently removed tracked file; git diff will surface it.
  }
}

const history = execFileSync(
  'git',
  [
    ...gitPrefix,
    'log',
    '--all',
    '--format=commit:%H',
    '-p',
    '--no-ext-diff',
    '--',
    '.',
    ':(exclude)server/package-lock.json',
    ':(exclude)client/package-lock.json',
  ],
  { cwd: root, encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 },
);
findings.push(...findingsIn(history, 'git-history'));

if (findings.length) {
  process.stderr.write('Potential secrets detected (values redacted):\n');
  for (const finding of findings)
    process.stderr.write(
      `- ${finding.kind} at ${finding.source}:${finding.line}\n`,
    );
  process.exitCode = 1;
} else {
  process.stdout.write(
    'No high-confidence secrets detected in tracked files or Git history.\n',
  );
}
