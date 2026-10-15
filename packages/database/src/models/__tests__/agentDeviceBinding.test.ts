// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { agents, devices, type NewAgent, users, workspaceMembers, workspaces } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { AgentModel } from '../agent';

const serverDB: OrviloDatabase = await getTestDB();

const userId = 'agent-device-binding-user';
const otherUserId = 'agent-device-binding-other';
const wsId = 'agent-device-binding-ws';
const personalDeviceId = 'personal-device-001';
const workspaceDeviceId = 'workspace-device-001';
const foreignDeviceId = 'foreign-device-001';
const missingDeviceId = 'missing-device-001';

const withRuntime = (config: Partial<NewAgent>, boundDeviceId = workspaceDeviceId) => ({
  ...config,
  agencyConfig: {
    boundDeviceId,
    executionTarget: 'device' as const,
    heterogeneousProvider: { type: 'codex' as const, model: 'default' },
    ...config.agencyConfig,
  },
});

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values([{ id: userId }, { id: otherUserId }]);
  await serverDB
    .insert(workspaces)
    .values([{ id: wsId, name: 'WS', slug: 'ws', primaryOwnerId: userId }]);
  await serverDB.insert(workspaceMembers).values({ role: 'owner', userId, workspaceId: wsId });
  await serverDB.insert(devices).values([
    { userId, deviceId: personalDeviceId, identitySource: 'machine-id' },
    {
      userId,
      deviceId: workspaceDeviceId,
      identitySource: 'machine-id',
    },
    { userId: otherUserId, deviceId: foreignDeviceId, identitySource: 'machine-id' },
  ]);
});

afterEach(async () => {
  await serverDB.delete(users);
});

describe('AgentModel saved global device binding', () => {
  describe('create', () => {
    it('allows a personal agent to bind its saved device', async () => {
      const personalModel = new AgentModel(serverDB, userId);
      const agent = await personalModel.create(
        withRuntime({
          title: 'Personal agent',
          agencyConfig: { boundDeviceId: personalDeviceId },
        }),
      );
      expect(agent.agencyConfig?.boundDeviceId).toBe(personalDeviceId);
    });

    it('allows a workspace agent to bind another owned global device', async () => {
      const wsModel = new AgentModel(serverDB, userId, wsId);
      const agent = await wsModel.create(
        withRuntime({
          title: 'WS agent',
          agencyConfig: { boundDeviceId: workspaceDeviceId },
        }),
      );
      expect(agent.agencyConfig?.boundDeviceId).toBe(workspaceDeviceId);
    });

    it('allows a workspace agent bound to its creator personal device', async () => {
      const wsModel = new AgentModel(serverDB, userId, wsId);
      const agent = await wsModel.create(
        withRuntime({
          title: 'WS agent',
          agencyConfig: { boundDeviceId: personalDeviceId },
        }),
      );
      expect(agent.agencyConfig?.boundDeviceId).toBe(personalDeviceId);
    });

    it('rejects a new working directory binding to a foreign-owned device', async () => {
      const wsModel = new AgentModel(serverDB, userId, wsId);
      await expect(
        wsModel.create(
          withRuntime({
            title: 'WS agent',
            agencyConfig: {
              workingDirByDevice: { [foreignDeviceId]: '/tmp' },
            },
          }),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'AGENT_HOST_UNAVAILABLE' });
    });

    it('allows a fixed device target without a device visibility grant', async () => {
      const wsModel = new AgentModel(serverDB, userId, wsId);
      const agent = await wsModel.create(
        withRuntime({
          title: 'Fixed WS agent',
          agencyConfig: {
            boundDeviceId: workspaceDeviceId,
            executionTarget: 'device',
          },
        }),
      );

      expect(agent.agencyConfig?.boundDeviceId).toBe(workspaceDeviceId);
    });

    it.each(['auto', 'none', 'sandbox'] as const)(
      'rejects creation without a saved host target: %s',
      async (executionTarget) => {
        const wsModel = new AgentModel(serverDB, userId, wsId);
        await expect(
          wsModel.create(
            withRuntime({
              title: 'Fixed WS agent',
              agencyConfig: { executionTarget },
            }),
          ),
        ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
      },
    );

    it('allows a saved local target bound to an owned global device', async () => {
      const wsModel = new AgentModel(serverDB, userId, wsId);
      const agent = await wsModel.create(
        withRuntime({
          title: 'Local WS agent',
          agencyConfig: { executionTarget: 'local' },
        }),
      );
      expect(agent.agencyConfig?.boundDeviceId).toBe(workspaceDeviceId);
      expect(agent.agencyConfig?.executionTarget).toBe('local');
    });

    it.each([missingDeviceId, foreignDeviceId])(
      'rejects a new unavailable host: %s',
      async (deviceId) => {
        const wsModel = new AgentModel(serverDB, userId, wsId);

        await expect(
          wsModel.create(
            withRuntime({
              title: 'Unavailable host agent',
              agencyConfig: {
                boundDeviceId: deviceId,
                executionTarget: 'device',
              },
            }),
          ),
        ).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'AGENT_HOST_UNAVAILABLE' });
      },
    );
  });

  describe('updateConfig', () => {
    it('preserves the saved device through a metadata update', async () => {
      const wsModel = new AgentModel(serverDB, userId, wsId);
      const agent = await wsModel.create(withRuntime({ title: 'WS agent' }));
      await wsModel.updateConfig(agent.id, { description: 'Changed' });
      const result = await serverDB.query.agents.findFirst({ where: eq(agents.id, agent.id) });
      expect(result?.agencyConfig?.boundDeviceId).toBe(workspaceDeviceId);
    });

    it('rejects clearing the saved device on a workspace agent', async () => {
      const wsModel = new AgentModel(serverDB, userId, wsId);
      const agent = await wsModel.create(
        withRuntime({
          title: 'WS agent',
          agencyConfig: { boundDeviceId: workspaceDeviceId },
        }),
      );
      await expect(
        wsModel.updateConfig(agent.id, { agencyConfig: { boundDeviceId: '' } }),
      ).rejects.toMatchObject({ message: 'AGENT_HOST_REQUIRED' });
    });

    it('allows switching a workspace agent to another owned global device', async () => {
      const otherWorkspaceDeviceId = 'workspace-device-002';
      await serverDB.insert(devices).values({
        userId,
        deviceId: otherWorkspaceDeviceId,
        identitySource: 'machine-id',
      });

      const wsModel = new AgentModel(serverDB, userId, wsId);
      const agent = await wsModel.create(
        withRuntime({
          title: 'WS agent',
          agencyConfig: { boundDeviceId: workspaceDeviceId },
        }),
      );
      await wsModel.updateConfig(agent.id, {
        agencyConfig: { boundDeviceId: otherWorkspaceDeviceId },
      });

      const result = await serverDB.query.agents.findFirst({
        where: eq(agents.id, agent.id),
      });
      expect(result?.agencyConfig?.boundDeviceId).toBe(otherWorkspaceDeviceId);
    });

    it('allows switching a workspace agent to its owner personal device', async () => {
      const wsModel = new AgentModel(serverDB, userId, wsId);
      const agent = await wsModel.create(
        withRuntime({
          title: 'WS agent',
          agencyConfig: { boundDeviceId: workspaceDeviceId },
        }),
      );
      await wsModel.updateConfig(agent.id, {
        agencyConfig: { boundDeviceId: personalDeviceId },
      });
      const stored = await serverDB.query.agents.findFirst({ where: eq(agents.id, agent.id) });
      expect(stored?.agencyConfig?.boundDeviceId).toBe(personalDeviceId);
    });

    it.each([missingDeviceId, foreignDeviceId])(
      'rejects switching to an unavailable host: %s',
      async (deviceId) => {
        const wsModel = new AgentModel(serverDB, userId, wsId);
        const agent = await wsModel.create(withRuntime({ title: 'WS agent' }));
        await expect(
          wsModel.updateConfig(agent.id, { agencyConfig: { boundDeviceId: deviceId } }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'AGENT_HOST_UNAVAILABLE' });
        const stored = await serverDB.query.agents.findFirst({ where: eq(agents.id, agent.id) });
        expect(stored?.agencyConfig?.boundDeviceId).toBe(workspaceDeviceId);
      },
    );

    it('allows clearing a workingDirByDevice entry on a workspace agent (undefined value)', async () => {
      const wsModel = new AgentModel(serverDB, userId, wsId);
      const agent = await wsModel.create(
        withRuntime({
          title: 'WS agent',
          agencyConfig: {
            boundDeviceId: workspaceDeviceId,
            workingDirByDevice: { [workspaceDeviceId]: '/work' },
          },
        }),
      );
      await expect(
        wsModel.updateConfig(agent.id, {
          agencyConfig: {
            workingDirByDevice: { [personalDeviceId]: undefined as unknown as string },
          },
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('publishToWorkspace', () => {
    const createPrivateFixedAgent = async () => {
      const wsModel = new AgentModel(serverDB, userId, wsId);
      // An existing private Agent can be published after its saved host is validated.
      const [agent] = await serverDB
        .insert(agents)
        .values({
          ...withRuntime({
            agencyConfig: {
              boundDeviceId: workspaceDeviceId,
              executionTarget: 'device',
            },
            title: 'Private fixed agent',
            visibility: 'private',
          }),
          userId,
          workspaceId: wsId,
        })
        .returning();

      return { agent, wsModel };
    };

    it('publishes a fixed agent bound to its owner global device', async () => {
      const { agent, wsModel } = await createPrivateFixedAgent();

      const published = await wsModel.publishToWorkspace(agent.id);

      expect(published.visibility).toBe('public');
    });

    it('blocks publishing when the saved host is no longer registered', async () => {
      const { agent, wsModel } = await createPrivateFixedAgent();
      await serverDB.delete(devices).where(eq(devices.deviceId, workspaceDeviceId));

      await expect(wsModel.publishToWorkspace(agent.id)).rejects.toThrow(/AGENT_HOST_UNAVAILABLE/);

      const stored = await serverDB.query.agents.findFirst({ where: eq(agents.id, agent.id) });
      expect(stored?.visibility).toBe('private');
    });

    it('blocks the direct visibility API from bypassing the missing-host check', async () => {
      const { agent, wsModel } = await createPrivateFixedAgent();
      await serverDB.delete(devices).where(eq(devices.deviceId, workspaceDeviceId));

      await expect(wsModel.setVisibility(agent.id, 'public')).rejects.toThrow(
        /AGENT_HOST_UNAVAILABLE/,
      );

      const stored = await serverDB.query.agents.findFirst({ where: eq(agents.id, agent.id) });
      expect(stored?.visibility).toBe('private');
    });
  });

  describe('duplicate', () => {
    it('refuses duplication when the saved host is missing', async () => {
      // A duplicate is a fresh runtime and must revalidate its saved host.
      const [sourceAgent] = await serverDB
        .insert(agents)
        .values({
          userId,
          workspaceId: wsId,
          title: 'Legacy WS agent',
          visibility: 'public',
          agencyConfig: {
            heterogeneousProvider: { type: 'codex', model: 'default' },
            boundDeviceId: missingDeviceId,
            executionTarget: 'device',
            workingDirByDevice: {
              [missingDeviceId]: '/tmp/legacy',
              [workspaceDeviceId]: '/tmp/ws',
            },
          },
        } as NewAgent)
        .returning();

      const wsModel = new AgentModel(serverDB, userId, wsId);
      await expect(wsModel.duplicate(sourceAgent.id)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'AGENT_HOST_UNAVAILABLE',
      });
      expect(await serverDB.select().from(agents)).toHaveLength(1);
    });
    it('preserves a valid owned global-device contract when duplicating', async () => {
      const [sourceAgent] = await serverDB
        .insert(agents)
        .values({
          userId,
          workspaceId: wsId,
          title: 'Fixed WS agent',
          visibility: 'public',
          agencyConfig: {
            heterogeneousProvider: { type: 'codex', model: 'default' },
            boundDeviceId: workspaceDeviceId,
            executionTarget: 'device',
            workingDirByDevice: { [workspaceDeviceId]: '/tmp/ws' },
          },
        } as NewAgent)
        .returning();

      const wsModel = new AgentModel(serverDB, userId, wsId);
      const result = await wsModel.duplicate(sourceAgent.id);

      const copy = await serverDB.query.agents.findFirst({
        where: eq(agents.id, result!.agentId),
      });
      expect(copy?.agencyConfig).toEqual({
        boundDeviceId: workspaceDeviceId,
        heterogeneousProvider: { type: 'codex', model: 'default' },
        executionTarget: 'device',
        workingDirByDevice: { [workspaceDeviceId]: '/tmp/ws' },
      });
    });

    it('refuses a fresh duplicate bound to another owner host', async () => {
      const [sourceAgent] = await serverDB
        .insert(agents)
        .values({
          userId,
          workspaceId: wsId,
          title: 'Legacy foreign-device agent',
          visibility: 'public',
          agencyConfig: {
            heterogeneousProvider: { type: 'codex', model: 'default' },
            boundDeviceId: foreignDeviceId,
            executionTarget: 'device',
          },
        } as NewAgent)
        .returning();

      const wsModel = new AgentModel(serverDB, userId, wsId);
      await expect(wsModel.duplicate(sourceAgent.id)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'AGENT_HOST_UNAVAILABLE',
      });
      expect(await serverDB.select().from(agents)).toHaveLength(1);
    });
  });

  describe('transferAgent', () => {
    it('preserves an owned personal-device binding when moving an agent into a workspace', async () => {
      const personalModel = new AgentModel(serverDB, userId);
      const agent = await personalModel.create(
        withRuntime({
          title: 'Personal agent',
          agencyConfig: {
            boundDeviceId: personalDeviceId,
            workingDirByDevice: { [personalDeviceId]: '/work' },
          },
        }),
      );

      await personalModel.transferAgent(agent.id, wsId, userId);

      const result = await serverDB.query.agents.findFirst({
        where: eq(agents.id, agent.id),
      });
      expect(result?.workspaceId).toBe(wsId);
      expect(result?.agencyConfig?.boundDeviceId).toBe(personalDeviceId);
      expect(result?.agencyConfig?.workingDirByDevice).toEqual({ [personalDeviceId]: '/work' });
    });

    it('preserves an owned global-device binding on a same-workspace transfer', async () => {
      const wsModel = new AgentModel(serverDB, userId, wsId);
      const agent = await wsModel.create(
        withRuntime({
          title: 'WS agent',
          agencyConfig: {
            boundDeviceId: workspaceDeviceId,
            workingDirByDevice: { [workspaceDeviceId]: '/work' },
          },
        }),
      );

      await wsModel.transferAgent(agent.id, wsId, userId);

      const result = await serverDB.query.agents.findFirst({
        where: eq(agents.id, agent.id),
      });
      expect(result?.agencyConfig?.boundDeviceId).toBe(workspaceDeviceId);
      expect(result?.agencyConfig?.workingDirByDevice?.[workspaceDeviceId]).toBe('/work');
    });

    it('preserves an owned local device when moving into a workspace', async () => {
      const personalModel = new AgentModel(serverDB, userId);
      const agent = await personalModel.create(
        withRuntime({
          title: 'Personal local agent',
          agencyConfig: {
            boundDeviceId: personalDeviceId,
            executionTarget: 'local',
          },
        }),
      );

      await personalModel.transferAgent(agent.id, wsId, userId);

      const result = await serverDB.query.agents.findFirst({
        where: eq(agents.id, agent.id),
      });
      expect(result?.agencyConfig?.boundDeviceId).toBe(personalDeviceId);
      expect(result?.agencyConfig?.executionTarget).toBe('local');
    });

    it('preserves a legacy sandbox target when moving into a workspace', async () => {
      const personalModel = new AgentModel(serverDB, userId);
      const [agent] = await serverDB
        .insert(agents)
        .values({
          userId,
          title: 'Personal sandbox agent',
          agencyConfig: { executionTarget: 'sandbox' },
        })
        .returning();

      await personalModel.transferAgent(agent.id, wsId, userId);

      const result = await serverDB.query.agents.findFirst({
        where: eq(agents.id, agent.id),
      });
      expect(result?.agencyConfig?.executionTarget).toBe('sandbox');
    });

    it('keeps the binding intact when moving back to personal scope', async () => {
      const wsModel = new AgentModel(serverDB, userId, wsId);
      const agent = await wsModel.create(
        withRuntime({
          title: 'WS agent',
          agencyConfig: { boundDeviceId: workspaceDeviceId },
        }),
      );

      await wsModel.transferAgent(agent.id, null, userId);

      const result = await serverDB.query.agents.findFirst({
        where: eq(agents.id, agent.id),
      });
      expect(result?.workspaceId).toBeNull();
      expect(result?.agencyConfig?.boundDeviceId).toBe(workspaceDeviceId);
    });
  });
});
