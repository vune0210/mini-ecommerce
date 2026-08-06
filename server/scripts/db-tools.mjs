import 'dotenv/config';
import { createDecipheriv, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';

export function databaseConfig() {
  const required = [
    'DB_HOST',
    'DB_PORT',
    'DB_USERNAME',
    'DB_PASSWORD',
    'DB_NAME',
  ];
  const missing = required.filter((key) => process.env[key] === undefined);
  if (missing.length)
    throw new Error(`Missing database variables: ${missing.join(', ')}`);
  return {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true',
  };
}

export function mysqlEnvironment(password) {
  return { ...process.env, MYSQL_PWD: password };
}

export function connectionArgs(config) {
  return [
    `--host=${config.host}`,
    `--port=${config.port}`,
    `--user=${config.username}`,
    ...(config.ssl ? ['--ssl-mode=REQUIRED'] : []),
  ];
}

export function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export async function sha256File(file) {
  await access(file, constants.R_OK);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function verifyBackup(file) {
  const absolute = resolve(file);
  const info = await stat(absolute);
  if (!info.isFile() || info.size < 100)
    throw new Error('Backup is missing or too small to be valid');

  const manifestPath = `${absolute}.json`;
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const digest = await sha256File(absolute);
    if (manifest.sha256 !== digest)
      throw new Error('Backup checksum does not match its manifest');
    if (manifest.bytes !== info.size)
      throw new Error('Backup size does not match its manifest');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const stream = backupReadStream(absolute, manifest);
  let sample = '';
  for await (const chunk of stream) {
    if (sample.length < 1024 * 1024) sample += chunk.toString('utf8');
  }
  if (!sample.includes('CREATE TABLE'))
    throw new Error('Backup does not contain a recognizable schema');
  return { absolute, bytes: info.size, sha256: await sha256File(absolute) };
}

export function backupEncryptionKey() {
  const encoded = process.env.BACKUP_ENCRYPTION_KEY;
  if (!encoded)
    throw new Error('BACKUP_ENCRYPTION_KEY is required (32 random bytes encoded as base64)');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32)
    throw new Error('BACKUP_ENCRYPTION_KEY must decode to exactly 32 bytes');
  return key;
}

export function backupReadStream(file, manifest) {
  const source = createReadStream(file);
  if (!manifest?.encryption) return source;
  const key = backupEncryptionKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(manifest.encryption.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(manifest.encryption.authTag, 'base64'));
  return source.pipe(decipher);
}
