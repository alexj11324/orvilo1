/**
 * Binds the E2E fake execution device to the test user's builtin inbox agent.
 *
 * The in-process agent runtime is retired: every web send resolves an
 * execution plan, and a hetero agent without a bound device lands on the
 * "No device bound" pending stub. The fake agent gateway emulates a connected
 * device (`POST /api/device/agent/run` → synthesized `lh hetero exec` turn via
 * `aiAgent.heteroIngest`/`heteroFinish`); this module seeds the other half —
 * a `devices` row plus `executionTarget: 'device'` + `boundDeviceId` on the
 * agent's `agency_config` — so dispatch resolves the real device path.
 *
 * Both scopes are bound (personal/unfiled and workspace copy) because the
 * inbox agent mints per-scope at first use.
 */
import type { APIRequestContext } from 'playwright';

import { TEST_USER } from './seedTestUser';

export const E2E_DEVICE_ID = 'e2e-mock-device';

interface TrpcData<T> {
  result?: { data?: { json?: T } };
}

const lambdaCall = async <T>(
  request: APIRequestContext,
  procedure: string,
  input: Record<string, unknown>,
  workspaceId?: string,
): Promise<T | undefined> => {
  const res = await request.post(`/trpc/lambda/${procedure}`, {
    data: { json: input },
    headers: {
      'content-type': 'application/json',
      ...(workspaceId ? { 'x-workspace-id': workspaceId } : {}),
    },
  });
  if (!res.ok()) {
    throw new Error(`${procedure} responded ${res.status()}: ${(await res.text()).slice(0, 300)}`);
  }
  const body = (await res.json()) as TrpcData<T>;
  return body.result?.data?.json;
};

/**
 * Idempotent binding. Called from the Before hook on every scenario — cookies
 * are already installed on the context, so `request` authenticates as
 * TEST_USER. Runs unconditionally so a scenario that creates a fresh
 * workspace still gets its newly minted inbox agent bound.
 */
export const bindTestUserExecutionDevice = async (request: APIRequestContext): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('⚠️ DATABASE_URL not set, skipping execution-device binding');
    return;
  }

  // Linear-model provisioning: every account lives inside a workspace. The
  // router is idempotent, and this call doubles as the trigger when the
  // scenario has not loaded any page yet.
  const workspace = await lambdaCall<{ id?: string }>(request, 'workspace.ensureDefault', {});
  const workspaceId = workspace?.id;

  // Force-mint the builtin inbox agent in both scopes (it materializes lazily
  // at first send otherwise — too late to bind for the first message).
  const agentIds: string[] = [];
  for (const scope of [workspaceId, undefined]) {
    try {
      const agent = await lambdaCall<{ id?: string } | null>(
        request,
        'agent.getBuiltinAgent',
        { slug: 'inbox' },
        scope,
      );
      if (agent?.id && !agentIds.includes(agent.id)) agentIds.push(agent.id);
    } catch (error) {
      console.warn(`[e2e] getBuiltinAgent failed (scope=${scope ?? 'personal'}):`, error);
    }
  }
  if (agentIds.length === 0) {
    throw new Error('no builtin inbox agent resolved — device binding would be a no-op');
  }

  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      `insert into devices (user_id, device_id, identity_source, hostname, platform, friendly_name, first_seen_at, last_seen_at, created_at, updated_at)
       values ($1, $2, 'machine-id', 'e2e-ci', 'linux', 'E2E Mock Device', now(), now(), now(), now())
       on conflict (user_id, device_id) where workspace_id is null do nothing`,
      [TEST_USER.id, E2E_DEVICE_ID],
    );
    await client.query(
      `update agents
       set agency_config = coalesce(agency_config, '{}'::jsonb) || $1::jsonb,
           updated_at = now()
       where id = any($2)`,
      [JSON.stringify({ boundDeviceId: E2E_DEVICE_ID, executionTarget: 'device' }), agentIds],
    );
  } finally {
    await client.end();
  }

  console.log(`✅ Bound ${E2E_DEVICE_ID} to inbox agents: ${agentIds.join(', ')}`);
};
