import { describe, expect, it } from 'vitest';

import { outboxRowToActivityEvent, projectOutboxEvent } from '../projection';
import type { OutboxEventRow } from '../projection';

const row = (overrides: Partial<OutboxEventRow> = {}): OutboxEventRow => ({
  aggregateId: 'task_1',
  aggregateType: 'task',
  createdAt: new Date('2026-09-17T12:00:00Z'),
  eventId: 'evt-1',
  eventType: 'task.input.submitted',
  id: 'row-1',
  payload: {},
  ...overrides,
});

describe('projectOutboxEvent', () => {
  it('routes a task event to its task room as an invalidate notice', () => {
    const deliveries = projectOutboxEvent(row());
    expect(deliveries).toEqual([
      {
        publish: {
          kind: 'broadcast',
          message: { entity: 'task', entityId: 'task_1', type: 'invalidate' },
        },
        room: 'task:task_1',
      },
    ]);
  });

  it('routes a project event to the project room', () => {
    const deliveries = projectOutboxEvent(
      row({ aggregateId: 'prj_1', aggregateType: 'project', eventType: 'task.input.submitted' }),
    );
    expect(deliveries[0]?.room).toBe('project:prj_1');
  });

  it('kicks the removed member on workspace.member.removed', () => {
    const deliveries = projectOutboxEvent(
      row({
        aggregateId: 'ws-1',
        aggregateType: 'workspace',
        eventType: 'workspace.member.removed',
        payload: { userId: 'user-9' },
      }),
    );
    expect(deliveries[0]).toEqual({
      publish: { kind: 'kick', reason: 'workspace.member.removed', userId: 'user-9' },
      room: 'workspace:ws-1',
    });
    expect(deliveries[1]?.publish.kind).toBe('broadcast');
  });

  it('kicks on workspace.member.suspended too', () => {
    const deliveries = projectOutboxEvent(
      row({
        aggregateId: 'ws-1',
        aggregateType: 'workspace',
        eventType: 'workspace.member.suspended',
        payload: { memberUserId: 'user-9' },
      }),
    );
    expect(deliveries[0]?.publish.kind).toBe('kick');
  });

  it('passes collaboration.activity payloads through as activity messages', () => {
    const activity = {
      action: 'task.status.changed',
      actor: { id: 'agt_1', kind: 'agent' },
      entityVersion: 4,
      eventId: 'evt-a1',
      expiresAt: '2026-09-17T12:00:10.000Z',
      occurredAt: '2026-09-17T12:00:00.000Z',
      phase: 'committed',
      projectId: 'prj_1',
      target: { anchor: 'status', entityId: 'task_1', entityType: 'task' },
      workspaceId: 'ws-1',
    };
    const deliveries = projectOutboxEvent(
      row({ eventType: 'collaboration.activity', payload: activity }),
    );
    expect(deliveries).toEqual([
      { publish: { kind: 'broadcast', message: { event: activity, type: 'activity' } }, room: 'task:task_1' },
    ]);
  });

  it('ignores non-room aggregates and malformed activity payloads fall back to invalidate', () => {
    expect(projectOutboxEvent(row({ aggregateType: 'user' }))).toEqual([]);
    const deliveries = projectOutboxEvent(
      row({ eventType: 'collaboration.activity', payload: { bogus: true } }),
    );
    expect(deliveries[0]?.publish.kind).toBe('broadcast');
    expect(deliveries[0]?.publish).toMatchObject({
      message: { type: 'invalidate' },
    });
  });
});

describe('outboxRowToActivityEvent', () => {
  it('synthesizes a minimal committed marker for domain events', () => {
    const event = outboxRowToActivityEvent(row({ payload: { workspaceId: 'ws-1' } }));
    expect(event).toMatchObject({
      action: 'task.input.submitted',
      eventId: 'evt-1',
      phase: 'committed',
      target: { entityId: 'task_1', entityType: 'task' },
      workspaceId: 'ws-1',
    });
  });

  it('returns null for aggregates with no room', () => {
    expect(outboxRowToActivityEvent(row({ aggregateType: 'user' }))).toBeNull();
  });

  it('returns null for workspace aggregates — they have no SemanticTarget', () => {
    // Workspace-aggregated rows only produce live invalidate/kick traffic.
    // Synthesizing an activity marker would emit a 'task' target whose
    // entityId is really a workspace id, sending the UI at a task that does
    // not exist.
    expect(
      outboxRowToActivityEvent(
        row({ aggregateId: 'ws-1', aggregateType: 'workspace', eventType: 'workspace.member.removed' }),
      ),
    ).toBeNull();
  });
});
