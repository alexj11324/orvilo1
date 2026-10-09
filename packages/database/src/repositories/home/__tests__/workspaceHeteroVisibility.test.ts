// Legacy workspace-private heterogeneous Agents remain visible only to
// their creator across the sidebar; current workspace Agents cannot become private.
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../../core/getTestDB';
import { AgentModel } from '../../../models/agent';
import * as Schema from '../../../schemas';
import { HomeRepository } from '../index';

const clientDB = await getTestDB();

const creator = 'u-creator';
const member = 'u-member';
const ws = 'ws-1';

beforeEach(async () => {
  await clientDB.delete(Schema.users);
  await clientDB.delete(Schema.workspaces);
  await clientDB.insert(Schema.users).values([{ id: creator }, { id: member }]);
  await clientDB.insert(Schema.workspaces).values({
    id: ws,
    name: 'WS',
    primaryOwnerId: creator,
    slug: 'ws-1',
  });
  await clientDB.insert(Schema.workspaceMembers).values([
    { workspaceId: ws, userId: creator, role: 'owner' },
    { workspaceId: ws, userId: member, role: 'member' },
  ]);
  // Creation admission requires a resolvable bound host.
  await clientDB.insert(Schema.devices).values({
    deviceId: `creation-host-${ws}`,
    identitySource: 'installation',
    userId: creator,
    visibility: 'public',
    workspaceId: ws,
  });
});

afterEach(async () => {
  await clientDB.delete(Schema.users);
  await clientDB.delete(Schema.workspaces);
});

describe('legacy workspace hetero agent visibility', () => {
  it('rejects a private flip while keeping a legacy private hetero agent visible only to its creator', async () => {
    const agentModel = new AgentModel(clientDB, creator, ws);

    // mirrors useCreateHeteroAgent -> lambda createAgent (public default)
    const agent = await agentModel.create({
      agencyConfig: {
        boundDeviceId: `creation-host-${ws}`,
        executionTarget: 'device',
        heterogeneousProvider: { command: 'claude', type: 'claude-code' },
      } as any,
      provider: 'claude-code',
      systemRole: '',
      title: 'CC Agent',
    });

    // sanity: visible in workspace sidebar (public)
    const before = await new HomeRepository(clientDB, creator, ws).getSidebarAgentList();
    expect(before.ungrouped.map((a) => a.id)).toContain(agent.id);

    await expect(agentModel.setVisibility(agent.id, 'private')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Workspace Agents must be public',
    });

    // Seed a historical private row; the current API cannot create this state.
    await clientDB
      .update(Schema.agents)
      .set({ visibility: 'private' })
      .where(eq(Schema.agents.id, agent.id));

    // creator should still see it in the Private bucket
    const after = await new HomeRepository(clientDB, creator, ws).getSidebarAgentList();
    const everywhere = [
      ...after.pinned,
      ...after.ungrouped,
      ...after.privateUngrouped,
      ...after.groups.flatMap((g) => g.items),
      ...after.privateGroups.flatMap((g) => g.items),
    ];
    expect(after.privateUngrouped.map((a) => a.id)).toContain(agent.id);
    expect(everywhere.map((a) => a.id)).toContain(agent.id);

    // member should NOT see it
    const memberView = await new HomeRepository(clientDB, member, ws).getSidebarAgentList();
    const memberAll = [
      ...memberView.pinned,
      ...memberView.ungrouped,
      ...memberView.privateUngrouped,
      ...memberView.groups.flatMap((g) => g.items),
      ...memberView.privateGroups.flatMap((g) => g.items),
    ];
    expect(memberAll.map((a) => a.id)).not.toContain(agent.id);
  });
});
