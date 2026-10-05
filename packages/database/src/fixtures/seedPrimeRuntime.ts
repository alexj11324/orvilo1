import { agents, credentials, devices, providerBindings } from '../schemas';
import type { OrviloDatabase } from '../type';

/**
 * Project creation auto-provisions a coordinator agent through Prime runtime
 * inheritance, which resolves only when the caller already owns an executable
 * orvilo runtime: a Prime agent bound to a resolvable host device, plus an
 * enabled provider binding backed by an owned credential.
 *
 * Personal scope (`workspaceId` omitted) binds a private caller-owned host;
 * workspace scope needs a public workspace-filed host to satisfy the strict
 * workspace host rule. Idempotent — a repeated call for the same scope only
 * adds another candidate Prime agent, never collides on row ids.
 */
export const seedPrimeRuntime = async (
  db: OrviloDatabase,
  { userId, workspaceId }: { userId: string; workspaceId?: string },
) => {
  const credentialId = `cred_${userId}_${workspaceId ?? 'personal'}`;
  const deviceId = `creation-host-${workspaceId ?? userId}`;

  await db
    .insert(credentials)
    .values({
      id: credentialId,
      key: `test-${credentialId}`,
      name: 'Fixture credential',
      ownerUserId: userId,
      payload: 'encrypted-test-fixture',
      type: 'kv-env' as const,
    })
    .onConflictDoNothing();
  await db.insert(providerBindings).values({
    config: {
      enabled: true,
      endpoint: 'https://provider.example/v1',
      model: 'gpt-4',
      name: 'Fixture Provider',
      provider: 'openai',
      secretReference: `credential:${credentialId}`,
      selection: {
        effort: 'default' as const,
        mode: 'default' as const,
        runtime: 'orvilo' as const,
        speed: 'default' as const,
        target: 'sandbox' as const,
      },
    },
    userId,
  });
  await db
    .insert(devices)
    .values(
      workspaceId
        ? {
            deviceId,
            identitySource: 'installation',
            userId,
            visibility: 'public' as const,
            workspaceId,
          }
        : {
            deviceId,
            identitySource: 'installation',
            userId,
            visibility: 'private' as const,
          },
    )
    .onConflictDoNothing();
  await db.insert(agents).values({
    agencyConfig: {
      boundDeviceId: deviceId,
      executionTarget: 'device' as const,
      heterogeneousProvider: { model: 'gpt-4', type: 'orvilo' as const },
    },
    model: 'gpt-4',
    provider: 'openai',
    title: 'Prime Seed',
    userId,
  });
};
