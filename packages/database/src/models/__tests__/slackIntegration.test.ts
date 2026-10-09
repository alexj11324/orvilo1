import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  agents,
  slackChannelBindings,
  slackUserConnections,
  users,
  workspaces,
} from '../../schemas';
import { SlackIntegrationModel } from '../slackIntegration';

const db = await getTestDB();
const model = new SlackIntegrationModel(db, 'slack-workspace');
const other = new SlackIntegrationModel(db, 'slack-other-workspace');
const input = {
  botTokenCiphertext: 'encrypted',
  botUserId: 'B1',
  installedByUserId: 'slack-user',
  scopes: ['chat:write'],
  slackTeamId: 'T1',
  teamName: 'Team',
};

const install = async (
  target: SlackIntegrationModel,
  values: Parameters<SlackIntegrationModel['upsertInstallation']>[0],
) => target.upsertInstallation(values, (await target.installation()) ?? null);
const bind = async (
  target: SlackIntegrationModel,
  values: Parameters<SlackIntegrationModel['saveBinding']>[0],
) =>
  target.saveBinding(
    values,
    (await target.installation()) ?? {
      id: '00000000-0000-0000-0000-000000000000',
      tokenRevision: '00000000-0000-0000-0000-000000000000',
    },
  );

beforeEach(async () => {
  await db.delete(users);
  await db.insert(users).values([{ id: 'slack-user' }, { id: 'slack-other-user' }]);
  await db.insert(workspaces).values([
    { id: 'slack-workspace', name: 'Slack', primaryOwnerId: 'slack-user', slug: 'slack' },
    {
      id: 'slack-other-workspace',
      name: 'Other',
      primaryOwnerId: 'slack-other-user',
      slug: 'slack-other',
    },
  ]);
  await db.insert(agents).values([
    { id: 'slack-agent', title: 'Agent', userId: 'slack-user', workspaceId: 'slack-workspace' },
    {
      id: 'slack-other-agent',
      title: 'Other agent',
      userId: 'slack-other-user',
      workspaceId: 'slack-other-workspace',
    },
  ]);
});
afterEach(async () => {
  await db.delete(users);
});

describe('SlackIntegrationModel', () => {
  it('rejects an archived agent before writing its channel binding', async () => {
    await install(model, input);
    await db.update(agents).set({ deletedAt: new Date() }).where(eq(agents.id, 'slack-agent'));
    await expect(
      bind(model, { agentId: 'slack-agent', slackChannelId: 'C1', slackChannelName: 'general' }),
    ).rejects.toThrow('Agent');
    expect(await model.bindings()).toEqual([]);
  });

  it('rolls back a channel binding when final transaction authorization rejects', async () => {
    const installation = await install(model, input);
    await expect(
      model.saveBinding(
        { agentId: 'slack-agent', slackChannelId: 'C1', slackChannelName: 'general' },
        installation!,
        async () => {
          throw new Error('access denied');
        },
      ),
    ).rejects.toThrow('access denied');
    expect(await model.bindings()).toEqual([]);
  });

  it('returns empty workspace state and rejects writes without an installation', async () => {
    expect(await model.installation()).toBeUndefined();
    expect(await model.connection('slack-user')).toBeUndefined();
    expect(await model.bindings()).toEqual([]);
    expect(await model.bindingByChannel('C1')).toBeUndefined();
    await expect(
      model.connectUser('00000000-0000-0000-0000-000000000000', 'slack-user', 'U1'),
    ).rejects.toThrow('installation');
    await expect(
      bind(model, {
        agentId: 'slack-agent',
        slackChannelId: 'C1',
        slackChannelName: 'general',
      }),
    ).rejects.toThrow('installation');
  });

  it('upserts an installation, rotates credentials, and enforces global team uniqueness', async () => {
    const first = await install(model, input);
    const updated = await install(model, {
      ...input,
      botTokenCiphertext: 'new-encrypted',
    });
    expect(updated.id).toBe(first.id);
    expect(updated.tokenRevision).not.toBe(first.tokenRevision);
    await expect(install(model, { ...input, slackTeamId: 'T2' })).rejects.toThrow('changing teams');
    expect(updated.scopes).toEqual(['chat:write']);
    expect((await model.installation())?.botTokenCiphertext).toBe('new-encrypted');
    expect(await other.installation()).toBeUndefined();
    await expect(install(other, input)).rejects.toThrow();
  });

  it('rejects a concurrent first installation for a different Slack team', async () => {
    const results = await Promise.allSettled([
      install(model, input),
      install(model, { ...input, slackTeamId: 'T2' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const saved = await model.installation();
    const fulfilled = results.find((result) => result.status === 'fulfilled');
    if (fulfilled?.status !== 'fulfilled') throw new Error('Expected one installation');
    expect(saved?.slackTeamId).toBe(fulfilled.value.slackTeamId);
  });

  it('rejects stale OAuth updates after disconnect and replacement', async () => {
    const captured = await install(model, input);
    await model.disconnect();
    await expect(model.upsertInstallation(input, captured)).rejects.toThrow('changed');
    expect(await model.installation()).toBeUndefined();
    const replacement = await install(model, input);
    await expect(model.upsertInstallation(input, captured)).rejects.toThrow('changed');
    expect((await model.installation())?.id).toBe(replacement.id);
    await expect(model.upsertInstallation(input, null)).rejects.toThrow('changed');
  });

  it('rejects channel saves using a disconnected, replaced, or rotated credential', async () => {
    const captured = await install(model, input);
    const binding = { agentId: 'slack-agent', slackChannelId: 'C1', slackChannelName: 'general' };
    await model.disconnect();
    await expect(model.saveBinding(binding, captured)).rejects.toThrow('changed');
    const replacement = await install(model, input);
    await expect(model.saveBinding(binding, captured)).rejects.toThrow('changed');
    await install(model, input);
    await expect(model.saveBinding(binding, replacement)).rejects.toThrow('changed');
    expect(await model.bindings()).toEqual([]);
  });

  it('locks and compares current installation versions within a transaction', async () => {
    await db.transaction(async (tx) => {
      const writeModel = new SlackIntegrationModel(tx, 'slack-workspace');
      expect(await writeModel.lockInstallation(null)).toBeUndefined();
      const saved = await writeModel.upsertInstallation(input, null);
      expect((await writeModel.lockInstallation(saved))?.id).toBe(saved.id);
      await expect(writeModel.lockInstallation(null)).rejects.toThrow('changed');
      await expect(
        writeModel.lockInstallation({
          ...saved,
          tokenRevision: '00000000-0000-0000-0000-000000000000',
        }),
      ).rejects.toThrow('changed');
    });
  });

  it('isolates personal connections and prevents duplicate Slack identities', async () => {
    const installation = await install(model, input);
    const otherInstallation = await install(other, { ...input, slackTeamId: 'T2' });
    const connected = await model.connectUser(installation.id, 'slack-user', 'U1', 'Alex');
    expect((await model.connection('slack-user'))?.displayName).toBe('Alex');
    expect(await other.connection('slack-user')).toBeUndefined();
    await expect(other.connectUser(installation.id, 'slack-user', 'U2')).rejects.toThrow(
      'installation',
    );
    await expect(model.connectUser(installation.id, 'slack-other-user', 'U1')).rejects.toThrow();
    const updated = await model.connectUser(installation.id, 'slack-user', 'U2');
    expect(updated.id).toBe(connected.id);
    expect(updated.displayName).toBeNull();
    await other.connectUser(otherInstallation.id, 'slack-user', 'U2');
    await model.disconnectPersonal('slack-user');
    expect(await model.connection('slack-user')).toBeUndefined();
    expect((await other.connection('slack-user'))?.slackUserId).toBe('U2');
  });

  it('upserts channel bindings, scopes deletion, and rejects foreign workspace agents', async () => {
    await install(model, input);
    await install(other, { ...input, slackTeamId: 'T2' });
    const binding = await bind(model, {
      agentId: 'slack-agent',
      slackChannelId: 'C1',
      slackChannelName: 'general',
    });
    const updated = await bind(model, {
      agentId: 'slack-agent',
      slackChannelId: 'C1',
      slackChannelName: 'renamed',
    });
    expect(updated.id).toBe(binding.id);
    expect(await model.bindings()).toEqual([
      expect.objectContaining({ agentName: 'Agent', slackChannelName: 'renamed' }),
    ]);
    expect((await model.bindingByChannel('C1'))?.id).toBe(binding.id);
    expect(await other.bindingByChannel('C1')).toBeUndefined();
    expect(await other.bindings()).toEqual([]);
    await expect(
      bind(model, {
        agentId: 'slack-other-agent',
        slackChannelId: 'C2',
        slackChannelName: 'foreign',
      }),
    ).rejects.toThrow('Agent');
    await expect(
      db.insert(slackChannelBindings).values({
        agentId: 'slack-agent',
        installationId: binding.installationId,
        slackChannelId: 'C1',
        slackChannelName: 'duplicate',
      }),
    ).rejects.toThrow();
    expect(await other.deleteBinding(binding.id)).toEqual([]);
    expect(await model.deleteBinding(binding.id)).toHaveLength(1);
  });

  it('retains workspace Slack when the installer deletes their account', async () => {
    const installation = await install(model, {
      ...input,
      installedByUserId: 'slack-other-user',
    });
    await model.connectUser(installation.id, 'slack-user', 'U1');
    await bind(model, {
      agentId: 'slack-agent',
      slackChannelId: 'C1',
      slackChannelName: 'general',
    });
    await db.delete(users).where(eq(users.id, 'slack-other-user'));
    expect((await model.installation())?.installedByUserId).toBeNull();
    expect((await model.connection('slack-user'))?.slackUserId).toBe('U1');
    expect(await model.bindings()).toHaveLength(1);
  });

  it('disconnects only the workspace installation and cascades child records', async () => {
    const installation = await install(model, input);
    await install(other, { ...input, slackTeamId: 'T2' });
    await model.connectUser(installation.id, 'slack-user', 'U1');
    await bind(model, {
      agentId: 'slack-agent',
      slackChannelId: 'C1',
      slackChannelName: 'general',
    });
    expect(await model.disconnect()).toHaveLength(1);
    expect(await model.installation()).toBeUndefined();
    expect(await db.select().from(slackUserConnections)).toEqual([]);
    expect(await db.select().from(slackChannelBindings)).toEqual([]);
    expect((await other.installation())?.slackTeamId).toBe('T2');
  });
});
