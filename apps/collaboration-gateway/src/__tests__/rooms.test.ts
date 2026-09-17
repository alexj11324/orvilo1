// @vitest-environment node
import type { CollaborationServerMessage } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { PRESENCE_TTL_MS, RoomHub, type GatewayConnection } from '../rooms';

const fakeConnection = (params: {
  connectionId: string;
  room?: string;
  userId?: string;
  workspaceId?: string;
}) => {
  const sent: CollaborationServerMessage[] = [];
  let closed = false;
  const connection: GatewayConnection = {
    actor: { id: params.userId ?? 'user-1', kind: 'human' },
    connectionId: params.connectionId,
    room: params.room ?? 'task:task-1',
    userId: params.userId ?? 'user-1',
    workspaceId: params.workspaceId ?? 'ws-1',
    close: () => {
      closed = true;
    },
    send: (message) => sent.push(message),
  };
  return { connection, sent, wasClosed: () => closed };
};

describe('RoomHub', () => {
  it('keeps multiple tabs of one user as separate connections', () => {
    const hub = new RoomHub();
    const tabA = fakeConnection({ connectionId: 'a' });
    const tabB = fakeConnection({ connectionId: 'b' });
    hub.join(tabA.connection);
    hub.join(tabB.connection);

    hub.updatePresence('a', 'task:task-1', { typing: true });
    hub.updatePresence('b', 'task:task-1', { typing: false });

    const entries = hub.presence('task:task-1');
    expect(entries.map((entry) => entry.connectionId).sort()).toEqual(['a', 'b']);
  });

  it('broadcasts presence to everyone except the sender', () => {
    const hub = new RoomHub();
    const a = fakeConnection({ connectionId: 'a' });
    const b = fakeConnection({ connectionId: 'b' });
    const c = fakeConnection({ connectionId: 'c', room: 'task:other' });
    hub.join(a.connection);
    hub.join(b.connection);
    hub.join(c.connection);

    hub.updatePresence('a', 'task:task-1', { typing: true });

    expect(a.sent).toHaveLength(0);
    expect(b.sent).toEqual([
      {
        actor: { id: 'user-1', kind: 'human' },
        connectionId: 'a',
        state: { typing: true },
        type: 'presence',
      },
    ]);
    expect(c.sent).toHaveLength(0); // other rooms never see it
  });

  it('expires presence after the TTL and emits presence-gone', () => {
    const hub = new RoomHub();
    const a = fakeConnection({ connectionId: 'a' });
    const b = fakeConnection({ connectionId: 'b' });
    hub.join(a.connection);
    hub.join(b.connection);

    const t0 = Date.now();
    hub.updatePresence('a', 'task:task-1', { typing: true }, t0);
    b.sent.length = 0;

    hub.sweepExpired(t0 + PRESENCE_TTL_MS + 1);

    expect(hub.presence('task:task-1', t0 + PRESENCE_TTL_MS + 1)).toHaveLength(0);
    expect(b.sent).toEqual([{ connectionId: 'a', type: 'presence-gone' }]);
  });

  it('emits presence-gone on leave only when presence was published', () => {
    const hub = new RoomHub();
    const a = fakeConnection({ connectionId: 'a' });
    const b = fakeConnection({ connectionId: 'b' });
    const watcher = fakeConnection({ connectionId: 'w' });
    hub.join(a.connection);
    hub.join(b.connection);
    hub.join(watcher.connection);

    hub.updatePresence('a', 'task:task-1', { typing: true });
    watcher.sent.length = 0;

    hub.leave('a', 'task:task-1'); // had presence → gone
    hub.leave('b', 'task:task-1'); // never published → silent

    expect(watcher.sent).toEqual([{ connectionId: 'a', type: 'presence-gone' }]);
  });

  it('kick revokes every connection of the user inside the workspace', () => {
    const hub = new RoomHub();
    const target1 = fakeConnection({ connectionId: 't1', userId: 'user-9' });
    const target2 = fakeConnection({ connectionId: 't2', room: 'task:task-2', userId: 'user-9' });
    const bystander = fakeConnection({ connectionId: 'keep', userId: 'user-1' });
    const foreignWs = fakeConnection({
      connectionId: 'foreign',
      userId: 'user-9',
      workspaceId: 'ws-2',
    });
    for (const c of [target1, target2, bystander, foreignWs]) hub.join(c.connection);

    hub.kick('ws-1', 'user-9', 'workspace.member.suspended');

    for (const target of [target1, target2]) {
      expect(target.sent).toEqual([{ reason: 'workspace.member.suspended', type: 'revoked' }]);
      expect(target.wasClosed()).toBe(true);
    }
    expect(bystander.sent).toHaveLength(0);
    expect(bystander.wasClosed()).toBe(false);
    expect(foreignWs.wasClosed()).toBe(false); // same user, other tenant
    expect(hub.connectionCount).toBe(2);
  });

  it('ignores malformed presence payloads', () => {
    const hub = new RoomHub();
    const a = fakeConnection({ connectionId: 'a' });
    hub.join(a.connection);

    hub.updatePresence('a', 'task:task-1', 'not-an-object');
    hub.updatePresence('a', 'task:task-1', null);

    expect(hub.presence('task:task-1')).toHaveLength(0);
  });
});
