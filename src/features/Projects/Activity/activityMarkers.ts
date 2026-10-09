import type { TaskWorkflowCategory } from '@orvilo/types';

import type { ActivityFeedRow, ProjectFeedEvent } from './activityFeedItems';

export type ActivityGlyph =
  | 'archive'
  | 'assignee'
  | 'automation'
  | 'badgeCheck'
  | 'circlePlay'
  | 'circleX'
  | 'statusProperty';

/**
 * The single leading mark of a feed line. Every line draws exactly one: the
 * actor appears in the sentence as text, and only becomes the mark (an avatar)
 * when a person did something that has no dedicated glyph of its own.
 */
export type ActivityMarker =
  | { kind: 'avatar' }
  | { glyph: ActivityGlyph; kind: 'glyph' }
  | { category: TaskWorkflowCategory; kind: 'workflow' }
  | { kind: 'milestone' }
  | { kind: 'priority'; level: number };

/**
 * Task execution status (what a `status` activity row records) to the
 * workflow-category mark an Issue draws everywhere else. `failed` has no
 * category of its own, so it falls back to the neutral Status property mark
 * instead of borrowing a misleading one.
 */
const STATUS_TO_CATEGORY: Partial<Record<string, TaskWorkflowCategory>> = {
  backlog: 'backlog',
  canceled: 'canceled',
  completed: 'done',
  paused: 'in_review',
  running: 'in_progress',
  scheduled: 'todo',
};

const PRIORITY_LEVELS = new Set([0, 1, 2, 3, 4]);

export const resolveRowMarker = (row: ActivityFeedRow): ActivityMarker => {
  switch (row.type) {
    case 'status': {
      const to = row.payload?.to;
      const category = typeof to === 'string' ? STATUS_TO_CATEGORY[to] : undefined;
      return category ? { category, kind: 'workflow' } : { glyph: 'statusProperty', kind: 'glyph' };
    }
    case 'priority': {
      const to = row.payload?.to;
      return {
        kind: 'priority',
        level: typeof to === 'number' && PRIORITY_LEVELS.has(to) ? to : 0,
      };
    }
    case 'automation': {
      return { glyph: 'automation', kind: 'glyph' };
    }
    default: {
      // assignee_agent | assignee_user | reviewer — someone did it; a system
      // action with no recorded actor has no face to show.
      return row.actor ? { kind: 'avatar' } : { glyph: 'assignee', kind: 'glyph' };
    }
  }
};

export const resolveEventMarker = (event: ProjectFeedEvent): ActivityMarker => {
  switch (event.type) {
    case 'milestone_added': {
      return { kind: 'milestone' };
    }
    case 'task_created': {
      // An Issue was created: its entity mark, not a generic "add" glyph. The
      // creation instant carries no status, so it reads as the backlog default.
      return { category: 'backlog', kind: 'workflow' };
    }
    case 'project_archived': {
      return { glyph: 'archive', kind: 'glyph' };
    }
    case 'review_rejected': {
      return { glyph: 'circleX', kind: 'glyph' };
    }
    case 'project_started': {
      return { glyph: 'circlePlay', kind: 'glyph' };
    }
    default: {
      // project_completed | review_accepted
      return { glyph: 'badgeCheck', kind: 'glyph' };
    }
  }
};

/** Comments and health updates are authored by a person: the author's avatar. */
export const UPDATE_MARKER: ActivityMarker = { kind: 'avatar' };
