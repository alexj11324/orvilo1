// A persisted legacy private workspace heterogeneous agent must stay visible
// to its creator (Private bucket) and invisible
// to other members across the whole sidebar payload.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../../core/getTestDB';
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
    { role: 'owner', userId: creator, workspaceId: ws },
    { role: 'member', userId: member, workspaceId: ws },
  ]);
});

afterEach(async () => {
  await clientDB.delete(Schema.users);
  await clientDB.delete(Schema.workspaces);
});

describe('legacy private workspace hetero agent visibility', () => {
  it('keeps the persisted private agent visible to its creator and hidden from other members', async () => {
    // Legacy rows remain private; new workspace Agents cannot be created or demoted as private.
    const [agent] = await clientDB
      .insert(Schema.agents)
      .values({
        agencyConfig: {
          executionTarget: 'device',
          heterogeneousProvider: { command: 'claude', type: 'claude-code' },
        },
        provider: 'claude-code',
        systemRole: '',
        title: 'CC Agent',
        userId: creator,
        visibility: 'private',
        workspaceId: ws,
      })
      .returning();

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
