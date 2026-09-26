// @vitest-environment node
import type { CollaborationServerMessage } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { type GatewayConnection, PRESENCE_TTL_MS, RoomHub } from '../rooms';

const fakeConnection = (params: {
  actorKind?: 'agent' | 'human' | 'system';
  connectionId: string;
  presenceVisible?: boolean;
  presenceVisibilityEpoch?: string;
  room?: string;
  userId?: string;
  workspaceId?: string;
}) => {
  const sent: CollaborationServerMessage[] = [];
  let closed = false;
  const connection: GatewayConnection = {
    actor: { id: params.userId ?? 'user-1', kind: params.actorKind ?? 'human' },
    connectionId: params.connectionId,
    presenceVisible: params.presenceVisible ?? true,
    presenceVisibilityEpoch: params.presenceVisibilityEpoch,
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

  it('suppresses hidden human presence while keeping the socket joined', () => {
    const hub = new RoomHub();
    const hidden = fakeConnection({ connectionId: 'hidden', presenceVisible: false });
    const watcher = fakeConnection({ connectionId: 'watcher', userId: 'user-2' });
    hub.join(hidden.connection);
    hub.join(watcher.connection);

    hub.updatePresence('hidden', 'task:task-1', { typing: true });

    expect(watcher.sent).toHaveLength(0);
    expect(hub.presence('task:task-1')).toHaveLength(0);
    expect(hub.connectionCount).toBe(2);
  });

  it('does not apply a human visibility preference to agent presence', () => {
    const hub = new RoomHub();
    const agent = fakeConnection({
      actorKind: 'agent',
      connectionId: 'agent',
      presenceVisible: false,
      userId: 'agent-1',
    });
    const watcher = fakeConnection({ connectionId: 'watcher', userId: 'user-2' });
    hub.join(agent.connection);
    hub.join(watcher.connection);

    hub.updatePresence('agent', 'task:task-1', { typing: true });

    expect(watcher.sent).toEqual([
      {
        actor: { id: 'agent-1', kind: 'agent' },
        connectionId: 'agent',
        state: { typing: true },
        type: 'presence',
      },
    ]);
  });

  it('conceals every old human connection across rooms without closing read sockets', () => {
    const hub = new RoomHub();
    const tabA = fakeConnection({ connectionId: 'a', room: 'task:task-1', userId: 'user-1' });
    const tabB = fakeConnection({ connectionId: 'b', room: 'project:project-1', userId: 'user-1' });
    const taskWatcher = fakeConnection({
      connectionId: 'task-watcher',
      room: 'task:task-1',
      userId: 'user-2',
    });
    const projectWatcher = fakeConnection({
      connectionId: 'project-watcher',
      room: 'project:project-1',
      userId: 'user-2',
    });
    for (const connection of [tabA, tabB, taskWatcher, projectWatcher]) {
      hub.join(connection.connection);
    }
    hub.updatePresence('a', 'task:task-1', { typing: true });
    hub.updatePresence('b', 'project:project-1', { typing: true });
    taskWatcher.sent.length = 0;
    projectWatcher.sent.length = 0;

    hub.setUserPresenceVisibility('user-1', false);

    expect(taskWatcher.sent).toEqual([{ connectionId: 'a', type: 'presence-gone' }]);
    expect(projectWatcher.sent).toEqual([{ connectionId: 'b', type: 'presence-gone' }]);
    expect(hub.presence('task:task-1')).toHaveLength(0);
    expect(hub.presence('project:project-1')).toHaveLength(0);
    expect(hub.connectionCount).toBe(4);

    hub.updatePresence('a', 'task:task-1', { typing: false });
    expect(taskWatcher.sent).toHaveLength(1);
    hub.broadcast('task:task-1', { type: 'pong' });
    expect(tabA.sent.at(-1)).toEqual({ type: 'pong' });
    expect(tabA.wasClosed()).toBe(false);
    expect(tabB.wasClosed()).toBe(false);
  });

  it('blocks a pre-minted visible ticket that joins after concealment', () => {
    const hub = new RoomHub();
    const now = Date.now();
    const watcher = fakeConnection({ connectionId: 'watcher', userId: 'user-2' });
    hub.join(watcher.connection, now);
    hub.setUserPresenceVisibility('user-1', false, 'hidden-epoch');

    const lateOldTicket = fakeConnection({
      connectionId: 'late',
      presenceVisibilityEpoch: 'old-epoch',
      userId: 'user-1',
    });
    hub.join(lateOldTicket.connection, now + 1);
    hub.updatePresence('late', 'task:task-1', { typing: true }, now + 2);

    expect(watcher.sent).toHaveLength(0);
    expect(hub.presence('task:task-1', now + 2)).toHaveLength(0);
    expect(lateOldTicket.wasClosed()).toBe(false);
  });

  it('re-enables only fresh post-reveal tickets immediately', () => {
    const hub = new RoomHub();
    const now = Date.now();
    const watcher = fakeConnection({ connectionId: 'watcher', userId: 'user-2' });
    const oldVisibleTicket = fakeConnection({
      connectionId: 'old',
      presenceVisibilityEpoch: 'old-epoch',
      userId: 'user-1',
    });
    hub.join(watcher.connection, now);
    hub.setUserPresenceVisibility('user-1', false, 'hidden-epoch');
    hub.join(oldVisibleTicket.connection, now + 1);

    hub.setUserPresenceVisibility('user-1', true, 'visible-epoch');
    hub.updatePresence('old', 'task:task-1', { typing: true }, now + 20);
    expect(watcher.sent).toHaveLength(0);

    const freshTicket = fakeConnection({
      connectionId: 'fresh',
      presenceVisibilityEpoch: 'visible-epoch',
      userId: 'user-1',
    });
    hub.join(freshTicket.connection, now + 12);
    hub.updatePresence('fresh', 'task:task-1', { typing: true }, now + 13);
    expect(watcher.sent.at(-1)).toMatchObject({ connectionId: 'fresh', type: 'presence' });
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

    hub.kick({
      reason: 'workspace.member.suspended',
      scope: 'workspace',
      scopeId: 'ws-1',
      userId: 'user-9',
      workspaceId: 'ws-1',
    });

    for (const target of [target1, target2]) {
      expect(target.sent).toEqual([{ reason: 'workspace.member.suspended', type: 'revoked' }]);
      expect(target.wasClosed()).toBe(true);
    }
    expect(bystander.sent).toHaveLength(0);
    expect(bystander.wasClosed()).toBe(false);
    expect(foreignWs.wasClosed()).toBe(false); // same user, other tenant
    expect(hub.connectionCount).toBe(2);
  });

  it('kick emits presence-gone for a kicked connection that had published presence', () => {
    const hub = new RoomHub();
    const target = fakeConnection({ connectionId: 't1', userId: 'user-9' });
    const bystander = fakeConnection({ connectionId: 'keep', userId: 'user-1' });
    hub.join(target.connection);
    hub.join(bystander.connection);
    hub.updatePresence('t1', 'task:task-1', { typing: true });
    bystander.sent.length = 0; // drop the presence broadcast itself

    hub.kick({
      reason: 'workspace.member.removed',
      scope: 'workspace',
      scopeId: 'ws-1',
      userId: 'user-9',
      workspaceId: 'ws-1',
    });

    // Peers stop rendering the kicked member immediately, not on TTL prune.
    expect(bystander.sent).toEqual([{ connectionId: 't1', type: 'presence-gone' }]);
  });

  it('a project-scoped kick drops the project room and its task rooms only', () => {
    const hub = new RoomHub();
    const projectRoom = fakeConnection({
      connectionId: 'p1',
      room: 'project:prj_1',
      userId: 'user-9',
    });
    projectRoom.connection.projectId = 'prj_1';
    const taskRoom = fakeConnection({
      connectionId: 't1',
      room: 'task:task-1',
      userId: 'user-9',
    });
    taskRoom.connection.projectId = 'prj_1';
    const otherProject = fakeConnection({
      connectionId: 'p2',
      room: 'project:other',
      userId: 'user-9',
    });
    otherProject.connection.projectId = 'other';
    const otherTask = fakeConnection({
      connectionId: 't2',
      room: 'task:task-2',
      userId: 'user-9',
    });
    otherTask.connection.projectId = 'other';
    const legacyTask = fakeConnection({
      connectionId: 't3',
      room: 'task:task-3',
      userId: 'user-9',
    }); // ticket minted before the project_id claim existed
    for (const c of [projectRoom, taskRoom, otherProject, otherTask, legacyTask]) {
      hub.join(c.connection);
    }

    hub.kick({
      reason: 'project_member.removed',
      scope: 'project',
      scopeId: 'prj_1',
      userId: 'user-9',
      workspaceId: 'ws-1',
    });

    for (const dropped of [projectRoom, taskRoom]) {
      expect(dropped.sent).toEqual([{ reason: 'project_member.removed', type: 'revoked' }]);
      expect(dropped.wasClosed()).toBe(true);
    }
    // Other projects' rooms and pre-claim tickets keep their access.
    for (const kept of [otherProject, otherTask, legacyTask]) {
      expect(kept.sent).toHaveLength(0);
      expect(kept.wasClosed()).toBe(false);
    }
  });

  it('a task-scoped kick drops exactly that room', () => {
    const hub = new RoomHub();
    const taskConn = fakeConnection({ connectionId: 't1', room: 'task:task-1', userId: 'user-9' });
    const projectConn = fakeConnection({
      connectionId: 'p1',
      room: 'project:prj_1',
      userId: 'user-9',
    });
    projectConn.connection.projectId = 'prj_1';
    hub.join(taskConn.connection);
    hub.join(projectConn.connection);

    hub.kick({
      reason: 'task.delegation.revoked',
      scope: 'task',
      scopeId: 'task-1',
      userId: 'user-9',
      workspaceId: 'ws-1',
    });

    expect(taskConn.wasClosed()).toBe(true);
    expect(projectConn.wasClosed()).toBe(false);
  });

  it('a versioned kick spares connections authorized at a newer version', () => {
    const hub = new RoomHub();
    const stale = fakeConnection({ connectionId: 'old', userId: 'user-9' });
    stale.connection.authzVersion = 4;
    const regranted = fakeConnection({
      connectionId: 'new',
      room: 'task:task-2',
      userId: 'user-9',
    });
    regranted.connection.authzVersion = 8;
    const unversioned = fakeConnection({
      connectionId: 'legacy',
      room: 'task:task-3',
      userId: 'user-9',
    });
    for (const c of [stale, regranted, unversioned]) hub.join(c.connection);

    hub.kick({
      authzVersion: 6,
      reason: 'workspace.member.removed',
      scope: 'workspace',
      scopeId: 'ws-1',
      userId: 'user-9',
      workspaceId: 'ws-1',
    });

    expect(stale.wasClosed()).toBe(true); // minted before the revoke
    expect(unversioned.wasClosed()).toBe(true); // no version ⇒ predates the contract
    expect(regranted.wasClosed()).toBe(false); // re-granted at v8 — the replayed v6 kick must not kill it
  });

  it('the sweep closes sockets whose ticket expired — expiry is not a revoke', () => {
    const hub = new RoomHub();
    const now = Date.now();
    const expired = fakeConnection({ connectionId: 'e1', userId: 'user-9' });
    expired.connection.ticketExpiresAt = now - 1;
    const live = fakeConnection({ connectionId: 'l1', room: 'task:task-2', userId: 'user-9' });
    live.connection.ticketExpiresAt = now + 60_000;
    const noExpiry = fakeConnection({ connectionId: 'l2', room: 'task:task-3', userId: 'user-9' });
    for (const c of [expired, live, noExpiry]) hub.join(c.connection);

    hub.sweepExpired(now);

    // Expired tickets close silently — no 'revoked' frame, so the client
    // re-authorizes (and only parks when the grant itself is gone).
    expect(expired.sent).toHaveLength(0);
    expect(expired.wasClosed()).toBe(true);
    expect(live.wasClosed()).toBe(false);
    expect(noExpiry.wasClosed()).toBe(false);
  });

  it('ignores malformed presence payloads', () => {
    const hub = new RoomHub();
    const a = fakeConnection({ connectionId: 'a' });
    hub.join(a.connection);

    hub.updatePresence('a', 'task:task-1', 'not-an-object');
    hub.updatePresence('a', 'task:task-1', null);

    expect(hub.presence('task:task-1')).toHaveLength(0);
  });

  it('drops malformed cursor and selection fields instead of trusting them', () => {
    const hub = new RoomHub();
    const a = fakeConnection({ connectionId: 'a' });
    const b = fakeConnection({ connectionId: 'b', userId: 'user-2' });
    hub.join(a.connection);
    hub.join(b.connection);

    hub.updatePresence('a', 'task:task-1', {
      // u must be a finite number — a string slips past an unchecked cast but
      // is rejected by the schema validation.
      cursor: { entityId: 'task-1', entityType: 'task', u: 'fast', v: 0.5 },
      selection: { entityId: 42, entityType: 'task' },
      typing: 'yes',
    });

    // Every malformed field is dropped — garbage never reaches peers.
    expect(b.sent).toEqual([
      {
        actor: { id: 'user-1', kind: 'human' },
        connectionId: 'a',
        state: {},
        type: 'presence',
      },
    ]);
    expect(hub.presence('task:task-1')).toEqual([
      { actor: { id: 'user-1', kind: 'human' }, connectionId: 'a', state: {} },
    ]);
  });

  it('keeps valid presence fields when a sibling field is malformed', () => {
    const hub = new RoomHub();
    const a = fakeConnection({ connectionId: 'a' });
    const b = fakeConnection({ connectionId: 'b', userId: 'user-2' });
    hub.join(a.connection);
    hub.join(b.connection);

    hub.updatePresence('a', 'task:task-1', {
      cursor: { entityId: 'task-1', entityType: 'task', u: Number.POSITIVE_INFINITY, v: 0 },
      selection: { anchor: 'task:task-1:title', entityId: 'task-1', entityType: 'task' },
      typing: true,
    });

    // A bad cursor never takes down the valid selection.
    expect(b.sent).toEqual([
      {
        actor: { id: 'user-1', kind: 'human' },
        connectionId: 'a',
        state: {
          selection: { anchor: 'task:task-1:title', entityId: 'task-1', entityType: 'task' },
          typing: true,
        },
        type: 'presence',
      },
    ]);
  });

  it('caps overlong strings rather than broadcasting them', () => {
    const hub = new RoomHub();
    const a = fakeConnection({ connectionId: 'a' });
    const b = fakeConnection({ connectionId: 'b', userId: 'user-2' });
    hub.join(a.connection);
    hub.join(b.connection);

    const huge = 'x'.repeat(10_000);
    hub.updatePresence('a', 'task:task-1', {
      cursor: {
        // Overlong OPTIONAL field → dropped; the cursor itself survives.
        anchor: huge,
        entityId: 'task-1',
        entityType: 'task',
        u: 0.1,
        v: 0.2,
      },
      // Overlong REQUIRED field → the whole selection is dropped.
      selection: { entityId: huge, entityType: 'task' },
    });

    expect(b.sent).toEqual([
      {
        actor: { id: 'user-1', kind: 'human' },
        connectionId: 'a',
        state: { cursor: { entityId: 'task-1', entityType: 'task', u: 0.1, v: 0.2 } },
        type: 'presence',
      },
    ]);
  });
});
