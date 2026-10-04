/**
 * Seeds the `provider_bindings` + personal `credentials` rows a builtin
 * `type:'orvilo'` run needs to pass embedded dispatch admission
 * (`resolveOrviloProviderBinding` → `issueBindingExecution` →
 * `capabilities`). Since the cutover there is no env fallback: a run with no
 * resolving binding fails `unauthorized` after `agent_runtime_init`.
 *
 * The binding points at the mock LLM (`E2E_MOCK_LLM_PORT`, :3406) whose
 * `/v1/models` advertises `deepseek-v4-flash`/`deepseek-v4-pro`, so the real
 * capability + infer path runs end to end — this fixture arms the product's
 * provider plane, it does not stub it. The `sandbox` target matches the
 * resolver's embedded-run lookup; the http endpoint is only reachable because
 * seeded rows bypass the https-for-sandbox write refine (which governs the
 * client write surface, not stored reads).
 *
 * `credentials.payload` is AES-256-GCM in the same `iv:authTag:ciphertext`
 * hex format `KeyVaultsGateKeeper.encrypt` emits, keyed by `KEY_VAULTS_SECRET`
 * (the e2e workflow and local setup both set it) — the server decrypts it
 * verbatim.
 */
import { TEST_USER } from './seedTestUser';

const MOCK_LLM_PORT = process.env.E2E_MOCK_LLM_PORT ?? '3406';
const CREDENTIAL_ID = `cred_e2e_mock_${TEST_USER.id}`;
const CREDENTIAL_KEY = 'e2e-mock-llm';
export const E2E_PRIME_MODEL = 'deepseek-v4-flash';
const BINDING_CONFIG = {
  name: 'E2E Mock DeepSeek',
  provider: 'deepseek',
  model: E2E_PRIME_MODEL,
  endpoint: `http://localhost:${MOCK_LLM_PORT}/v1`,
  secretReference: `credential:${CREDENTIAL_ID}`,
  enabled: true,
  selection: {
    runtime: 'orvilo',
    target: 'sandbox',
    effort: 'default',
    mode: 'default',
    speed: 'default',
  },
};

const encryptPayload = async (plaintext: string): Promise<string> => {
  const secret = process.env.KEY_VAULTS_SECRET;
  if (!secret) throw new Error('KEY_VAULTS_SECRET is not set');
  const rawKey = Buffer.from(secret, 'base64');
  const aesKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { length: 256, name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = Buffer.from(
    await crypto.subtle.encrypt(
      { iv, name: 'AES-GCM' },
      aesKey,
      new TextEncoder().encode(plaintext),
    ),
  );
  const authTag = data.slice(-16);
  const encrypted = data.slice(0, -16);
  return `${Buffer.from(iv).toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
};

export const seedOrviloProviderBinding = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn('   ⚠️  Skipping provider-binding seed: DATABASE_URL is not set');
    return;
  }
  const { Client } = await import('pg');
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO credentials (id, owner_user_id, key, name, type, payload, created_at, updated_at)
       SELECT $1, $2, $3, $4, 'kv-env', $5, NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM credentials WHERE owner_user_id = $2 AND key = $3 AND workspace_id IS NULL
       )`,
      [
        CREDENTIAL_ID,
        TEST_USER.id,
        CREDENTIAL_KEY,
        'E2E Mock LLM',
        await encryptPayload(JSON.stringify({ values: { DEEPSEEK_API_KEY: 'e2e-mock-key' } })),
      ],
    );
    await client.query(
      `INSERT INTO provider_bindings (user_id, config, revision, created_at, updated_at)
       SELECT $1, $2::jsonb, 1, NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM provider_bindings
         WHERE user_id = $1
           AND config->'selection'->>'runtime' = 'orvilo'
           AND config->'selection'->>'target' = 'sandbox'
           AND config->>'enabled' = 'true'
       )`,
      [TEST_USER.id, JSON.stringify(BINDING_CONFIG)],
    );
    console.log(
      `   🔌 Provider binding seeded for ${TEST_USER.id} → ${BINDING_CONFIG.endpoint} (${BINDING_CONFIG.model})`,
    );
  } finally {
    await client.end();
  }
};
