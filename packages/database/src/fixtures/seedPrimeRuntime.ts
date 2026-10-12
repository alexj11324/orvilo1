import { UserModel } from '../models/user';
import { WorkspaceUserSettingsModel } from '../models/workspaceUserSettings';
import { agents, credentials, devices, providerBindings } from '../schemas';
import type { OrviloDatabase } from '../type';

/**
 * Establish a configured Prime Orchestrator default for resource creation:
 * a saved agent bound to a resolvable host, plus an enabled provider binding
 * backed by an owned credential.
 *
 * Both scopes bind a caller-owned host; devices have no workspace visibility.
 * Repeated calls select a new saved source Agent without colliding on
 * credential or device row ids.
 */
export const seedPrimeRuntime = async (
  db: OrviloDatabase,
  { userId, workspaceId }: { userId: string; workspaceId?: string },
) => {
  const credentialId = `cred_${userId}_${workspaceId ?? 'personal'}`;
  const deviceId = `creation-host-${userId}`;

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
    .values({ deviceId, identitySource: 'installation', userId })
    .onConflictDoNothing();
  const [source] = await db
    .insert(agents)
    .values({
      agencyConfig: {
        boundDeviceId: deviceId,
        executionTarget: 'device' as const,
        heterogeneousProvider: { model: 'gpt-4', type: 'orvilo' as const },
      },
      model: 'gpt-4',
      provider: 'openai',
      title: 'Prime Seed',
      userId,
      workspaceId,
    })
    .returning();
  const preference = { orchestratorAgentId: source.id };
  if (workspaceId)
    await new WorkspaceUserSettingsModel(db, userId, workspaceId).updatePreference(preference);
  else await new UserModel(db, userId).updatePreference(preference);
};
