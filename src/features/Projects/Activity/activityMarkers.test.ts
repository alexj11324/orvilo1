import { describe, expect, it } from 'vitest';

import type { ActivityFeedRow, ProjectFeedEvent } from './activityFeedItems';
import { resolveEventMarker, resolveRowMarker, UPDATE_MARKER } from './activityMarkers';

const row = (patch: Partial<ActivityFeedRow>): ActivityFeedRow => ({
  createdAt: '2026-01-01T00:00:00.000Z',
  id: 'r1',
  taskIdentifier: 'ORV-1',
  taskTitle: 'Task',
  type: 'status',
  ...patch,
});

const event = (type: ProjectFeedEvent['type']): ProjectFeedEvent => ({
  createdAt: '2026-01-01T00:00:00.000Z',
  id: type,
  type,
});

describe('resolveRowMarker', () => {
  it.each([
    ['backlog', 'backlog'],
    ['scheduled', 'todo'],
    ['running', 'in_progress'],
    ['paused', 'in_review'],
    ['completed', 'done'],
    ['canceled', 'canceled'],
  ])('maps a status change to %s onto the %s workflow mark', (to, category) => {
    expect(resolveRowMarker(row({ payload: { to } }))).toEqual({ category, kind: 'workflow' });
  });

  it('falls back to the Status property mark for statuses without a category', () => {
    const fallback = { glyph: 'statusProperty', kind: 'glyph' };
    expect(resolveRowMarker(row({ payload: { to: 'failed' } }))).toEqual(fallback);
    expect(resolveRowMarker(row({ payload: null }))).toEqual(fallback);
  });

  it('uses the new priority level, defaulting unknown values to none', () => {
    expect(resolveRowMarker(row({ payload: { to: 2 }, type: 'priority' }))).toEqual({
      kind: 'priority',
      level: 2,
    });
    expect(resolveRowMarker(row({ payload: { to: 9 }, type: 'priority' }))).toEqual({
      kind: 'priority',
      level: 0,
    });
  });

  it('uses the automation glyph for automation changes', () => {
    expect(resolveRowMarker(row({ type: 'automation' }))).toEqual({
      glyph: 'automation',
      kind: 'glyph',
    });
  });

  it('shows the actor avatar for assignment events, a glyph when there is no actor', () => {
    const actor = { name: 'Ada', type: 'user' as const };
    for (const type of ['assignee_agent', 'assignee_user', 'reviewer'] as const) {
      expect(resolveRowMarker(row({ actor, type }))).toEqual({ kind: 'avatar' });
      expect(resolveRowMarker(row({ actor: null, type }))).toEqual({
        glyph: 'assignee',
        kind: 'glyph',
      });
    }
  });
});

describe('resolveEventMarker', () => {
  it('draws a created Issue with its entity mark, not a plus glyph', () => {
    expect(resolveEventMarker(event('task_created'))).toEqual({
      category: 'backlog',
      kind: 'workflow',
    });
  });

  it('keeps the milestone diamond and the dedicated lifecycle glyphs', () => {
    expect(resolveEventMarker(event('milestone_added'))).toEqual({ kind: 'milestone' });
    expect(resolveEventMarker(event('project_started'))).toEqual({
      glyph: 'circlePlay',
      kind: 'glyph',
    });
    expect(resolveEventMarker(event('project_archived'))).toEqual({
      glyph: 'archive',
      kind: 'glyph',
    });
    expect(resolveEventMarker(event('review_rejected'))).toEqual({
      glyph: 'circleX',
      kind: 'glyph',
    });
    for (const type of ['project_completed', 'review_accepted'] as const) {
      expect(resolveEventMarker(event(type))).toEqual({ glyph: 'badgeCheck', kind: 'glyph' });
    }
  });
});

describe('UPDATE_MARKER', () => {
  it('is the author avatar', () => {
    expect(UPDATE_MARKER).toEqual({ kind: 'avatar' });
  });
});
