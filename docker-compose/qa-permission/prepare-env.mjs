import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const directory = process.argv[2];
if (
  directory !== '/run/orvilo-qa-permission' &&
  !directory?.startsWith(`${process.env.RUNNER_TEMP}/qa-env-`)
)
  throw new Error('Secret output must be in the dedicated QA runtime directory');
if (!process.env.CLERK_SECRET_KEY)
  throw new Error('Existing authorized Clerk verifier credential required');
if (!/^ghcr\.io\/alexj11324\/orvilo1@sha256:[a-f0-9]{64}$/.test(process.env.QA_IMAGE_REF || ''))
  throw new Error('Pinned candidate image required');
if (
  !/^ghcr\.io\/alexj11324\/orvilo1@sha256:[a-f0-9]{64}$/.test(
    process.env.QA_GATEWAY_IMAGE_REF || '',
  )
)
  throw new Error('Pinned QA gateway image required');

const random = () => randomBytes(32).toString('hex');
const writeEnv = async (file, entries) => {
  for (const value of Object.values(entries)) {
    if (typeof value !== 'string' || /[\r\n\0]/.test(value))
      throw new Error('Invalid secret environment value');
  }
  await writeFile(
    path.join(directory, file),
    Object.entries(entries)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
    { mode: 0o600, flag: 'wx' },
  );
};

await mkdir(directory, { mode: 0o700 });
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const keyMetadata = { alg: 'RS256', use: 'sig', kid: randomBytes(8).toString('hex') };
const jwks = JSON.stringify({
  keys: [{ ...privateKey.export({ format: 'jwk' }), ...keyMetadata }],
});
const publicJwks = JSON.stringify({
  keys: [{ ...publicKey.export({ format: 'jwk' }), ...keyMetadata }],
});
const dbPassword = random();
const storageKey = randomBytes(16).toString('hex');
const storageSecret = random();
const smtpPassword = random();
const agentToken = random();
const deviceToken = random();
const smtpUser = 'qa-invites@qa-mail.aspectlylabs.com';

await writeEnv('compose.env', {
  QA_IMAGE_REF: process.env.QA_IMAGE_REF,
  QA_GATEWAY_IMAGE_REF: process.env.QA_GATEWAY_IMAGE_REF,
  QA_POSTGRES_PASSWORD: dbPassword,
  QA_STORAGE_ACCESS_KEY: storageKey,
  QA_STORAGE_SECRET_KEY: storageSecret,
  QA_SMTP_USER: smtpUser,
  QA_SMTP_PASSWORD: smtpPassword,
  QA_HATCHET_POSTGRES_PASSWORD: random(),
  QA_HATCHET_ADMIN_PASSWORD: random(),
});
await writeEnv('app.env', {
  APP_URL: 'https://qa-permission.aspectlylabs.com',
  INTERNAL_APP_URL: 'http://app:3210',
  AUTH_ACCOUNTS_URL: 'https://accounts-qa-permission.aspectlylabs.com',
  CLERK_ISSUER: 'https://clerk.aspectlylabs.com',
  CLERK_AUTHORIZED_PARTIES: 'https://accounts-qa-permission.aspectlylabs.com',
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  AUTH_SECRET: random(),
  KEY_VAULTS_SECRET: randomBytes(32).toString('base64'),
  JWKS_KEY: jwks,
  DATABASE_URL: `postgresql://qa_permission:${dbPassword}@postgres:5432/qa_permission`,
  REDIS_URL: 'redis://redis:6379',
  REDIS_PREFIX: 'qa-permission-20261008',
  REDIS_TLS: '0',
  S3_ENDPOINT: 'http://storage:9000',
  S3_PRESIGN_ENDPOINT: 'https://qa-permission.aspectlylabs.com',
  S3_BUCKET: 'qa-permission-20261008',
  S3_ACCESS_KEY_ID: storageKey,
  S3_ACCESS_KEY: storageKey,
  S3_SECRET_ACCESS_KEY: storageSecret,
  S3_ENABLE_PATH_STYLE: '1',
  S3_SET_ACL: '0',
  EMAIL_SERVICE_PROVIDER: 'nodemailer',
  SMTP_HOST: 'mailpit',
  SMTP_PORT: '1025',
  SMTP_SECURE: 'false',
  SMTP_USER: smtpUser,
  SMTP_PASS: smtpPassword,
  SMTP_FROM: smtpUser,
  AGENT_RUNTIME_MODE: 'queue',
  HATCHET_CLIENT_TLS_STRATEGY: 'none',
  HATCHET_WORKER_NAME: 'orvilo-qa-permission',
  HATCHET_WORKER_SLOTS: '4',
  HATCHET_WORKER_ENABLED: '0',
  DEVICE_GATEWAY_URL: 'https://qa-permission.aspectlylabs.com/_qa/device-gateway',
  DEVICE_GATEWAY_SERVICE_TOKEN: deviceToken,
  ENABLE_AGENT_GATEWAY: '1',
  AGENT_GATEWAY_URL: 'https://qa-permission.aspectlylabs.com/_qa/agent-gateway',
  AGENT_GATEWAY_SERVICE_TOKEN: agentToken,
  COLLABORATION_GATEWAY_URL: 'http://collaboration:3012',
  COLLABORATION_GATEWAY_PUBLIC_URL: 'wss://qa-permission.aspectlylabs.com/_qa/collaboration',
});
await writeEnv('agent-gateway.env', {
  SERVICE_TOKEN: agentToken,
  JWKS_PUBLIC_KEY: publicJwks,
  LOBE_API_BASE_URL: 'https://qa-permission.aspectlylabs.com',
});
await writeEnv('device-gateway.env', {
  SERVICE_TOKEN: deviceToken,
  JWKS_PUBLIC_KEY: publicJwks,
  ORVILO_API_BASE_URL: 'https://qa-permission.aspectlylabs.com',
  HOST: '0.0.0.0',
});
await writeEnv('collaboration.env', { JWKS_KEY: jwks, COLLABORATION_GATEWAY_PORT: '3012' });
// This contains only public key material; gateway trust can be independently checked.
await writeFile(path.join(directory, 'jwks.public.json'), publicJwks + '\n', {
  mode: 0o600,
  flag: 'wx',
});
