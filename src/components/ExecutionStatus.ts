import type {
  ChatTopicStatus,
  ProjectStatus,
  TaskExecutionState,
  TaskStatus,
  TaskWorkflowCategory,
} from '@orvilo/types';
import { PROJECT_STATUSES } from '@orvilo/types';
import type { LucideIcon } from 'lucide-react';
import {
  Archive,
  Circle,
  CircleCheck,
  CircleDot,
  CircleHelpIcon,
  CirclePause,
  CircleX,
  Clock,
  HandIcon,
  PauseCircle,
  StarIcon,
  TriangleAlert,
} from 'lucide-react';

import {
  type StatusIconComponent,
  StatusPropertyIcon,
  WORKFLOW_CATEGORY_ICONS,
} from './WorkflowCategoryIcon';

export interface ExecutionStatusVisual {
  color: string;
  icon: LucideIcon;
}

/**
 * A status mark that may be a lucide glyph or one of the traced workflow
 * icons — for surfaces that draw either axis. Rendered through `@lobehub/ui`'s
 * `<Icon icon>`, which takes both kinds.
 */
export interface StatusVisual {
  color: string;
  icon: LucideIcon | StatusIconComponent;
}

/**
 * Canonical glyph + color per execution-status semantic, shared by tasks and
 * topics (sidebar rows, group headers, kanban columns, management table). One
 * semantic → one visual, so the same state never renders with
 * different icons across surfaces. Live "running" rows may still swap the
 * static glyph for the animated `RingLoadingIcon` — same circle family and
 * warning color, animation just signals liveness.
 */
const VISUALS = {
  archived: { color: 'var(--ant-color-text-description)', icon: Archive },
  backlog: { color: 'var(--ant-color-text-quaternary)', icon: CircleDot },
  canceled: { color: 'var(--ant-orange)', icon: CirclePause },
  completed: { color: 'var(--ant-color-success)', icon: CircleCheck },
  failed: { color: 'var(--ant-color-error)', icon: CircleX },
  idle: { color: 'var(--ant-color-text-tertiary)', icon: Circle },
  running: { color: 'var(--ant-color-warning)', icon: CircleDot },
  scheduled: { color: 'var(--ant-color-warning)', icon: Clock },
  waitingForHuman: { color: 'var(--ant-color-info)', icon: HandIcon },
} satisfies Record<string, ExecutionStatusVisual>;

export const TASK_STATUS_VISUALS: Record<TaskStatus, ExecutionStatusVisual> = {
  backlog: VISUALS.backlog,
  canceled: VISUALS.canceled,
  completed: VISUALS.completed,
  failed: VISUALS.failed,
  // Task `paused` is surfaced as "Pending review" — Cordy's in-review
  // category, so it takes the review glyph (violet clock), not the
  // waiting-for-human hand a topic uses.
  paused: { color: 'var(--ant-purple)', icon: Clock },
  running: VISUALS.running,
  scheduled: VISUALS.scheduled,
};

const TASK_STATUS_SET = new Set<string>(Object.keys(TASK_STATUS_VISUALS));

/** Normalize untrusted persisted/API values before rendering a task status. */
export const resolveTaskStatus = (status: null | string | undefined): TaskStatus =>
  status && TASK_STATUS_SET.has(status) ? (status as TaskStatus) : 'backlog';

/**
 * One glyph + color per Linear workflow category — the business-state axis a
 * task's `workflowCategory` carries, kept deliberately distinct from the
 * execution axis above (a card can be `status: 'backlog'` while its business
 * state is `todo`). Glyphs are Linear's own ring-and-pie marks
 * (`WORKFLOW_CATEGORY_ICONS`) and the colors are Linear's: grey backlog/todo,
 * yellow in progress, green in review, indigo done, grey canceled, orange
 * triage. Task rows, board cards, the `wf:` kanban columns, workflow-category
 * group headers and the filter menu all read this map, so the same category
 * never draws two marks — do not reach for a lucide circle instead.
 */
export const WORKFLOW_CATEGORY_VISUALS: Record<TaskWorkflowCategory, StatusVisual> = {
  backlog: { color: 'var(--ant-color-text-quaternary)', icon: WORKFLOW_CATEGORY_ICONS.backlog },
  canceled: { color: 'var(--ant-color-text-description)', icon: WORKFLOW_CATEGORY_ICONS.canceled },
  // Linear's brand indigo — the same paint the milestone diamond uses.
  done: { color: '#5e6ad2', icon: WORKFLOW_CATEGORY_ICONS.done },
  in_progress: { color: 'var(--ant-color-warning)', icon: WORKFLOW_CATEGORY_ICONS.in_progress },
  in_review: { color: 'var(--ant-color-success)', icon: WORKFLOW_CATEGORY_ICONS.in_review },
  todo: { color: 'var(--ant-color-text-tertiary)', icon: WORKFLOW_CATEGORY_ICONS.todo },
  triage: { color: 'var(--ant-orange)', icon: WORKFLOW_CATEGORY_ICONS.triage },
};

/**
 * The one status mark an Issue draws on a board card, list row, sub-issue row
 * or group header. An Issue without a category reads as backlog — never as an
 * execution status icon.
 */
export const getIssueStatusVisual = ({
  workflowCategory,
}: {
  workflowCategory?: TaskWorkflowCategory | null;
}): StatusVisual => WORKFLOW_CATEGORY_VISUALS[workflowCategory ?? 'backlog'];

/**
 * The icon for the Status *property* (filter rows, bulk "Status" button,
 * context-menu "Status" submenu, "changed status" activity) — as opposed to
 * the per-value marks above. One mark, so the same field never reads as two.
 */
export const STATUS_PROPERTY_ICON: StatusIconComponent = StatusPropertyIcon;

export const PROJECT_STATUS_VISUALS: Record<ProjectStatus, ExecutionStatusVisual> = {
  active: VISUALS.running,
  archived: VISUALS.archived,
  backlog: VISUALS.backlog,
  canceled: VISUALS.canceled,
  completed: VISUALS.completed,
  paused: { color: 'var(--ant-color-text-secondary)', icon: PauseCircle },
  planned: { color: 'var(--ant-purple)', icon: CircleDot },
  reviewing: VISUALS.waitingForHuman,
};

const PROJECT_STATUS_SET = new Set<string>(PROJECT_STATUSES);

/** Normalize untrusted persisted/API values before rendering a project status. */
export const resolveProjectStatus = (status: null | string | undefined): ProjectStatus =>
  status && PROJECT_STATUS_SET.has(status) ? (status as ProjectStatus) : 'backlog';

export const TOPIC_STATUS_VISUALS: Record<ChatTopicStatus, ExecutionStatusVisual> = {
  active: VISUALS.idle,
  archived: VISUALS.archived,
  // Topic lists are mostly history: mute completed to keep long lists quiet,
  // unlike task boards where a green check marks an achievement.
  completed: { ...VISUALS.completed, color: 'var(--ant-color-text-description)' },
  // A failed topic is an alert the user should act on, not a terminal outcome
  // like a failed task run — the warning triangle reads that way, the circled X
  // reads as "closed/rejected".
  failed: { ...VISUALS.failed, icon: TriangleAlert },
  running: VISUALS.running,
  scheduled: VISUALS.scheduled,
  // `unread` rows render a custom ripple dot; this is the fallback glyph.
  unread: { color: 'var(--ant-color-info)', icon: CircleDot },
  waitingForHuman: VISUALS.waitingForHuman,
};

/**
 * Synthetic sidebar group buckets that don't map 1:1 to a persisted status:
 * `favorite` is split out by `buildGroupedTopics`; `pending` collapses the
 * attention-needing states (waiting for human / failed / unread) and borrows
 * the waiting-for-human glyph since "needs your attention" is its semantic.
 */
export const TOPIC_GROUP_VISUALS = {
  favorite: { color: 'var(--ant-color-text-tertiary)', icon: StarIcon },
  pending: VISUALS.waitingForHuman,
} satisfies Record<string, ExecutionStatusVisual>;

export const EXECUTION_STATUS_VISUALS = VISUALS;

/**
 * One glyph + color per canonical execution state (the PR-A `TaskExecutionState`
 * projection — queued/provisioning/running/waiting/succeeded/failed/canceled/
 * outcome_unknown), used by filter rows and the Execution field's enum
 * options. Distinct axis from `WORKFLOW_CATEGORY_VISUALS`: a task whose issue
 * status is In Review can simultaneously show `succeeded` here.
 */
export const EXECUTION_STATE_VISUALS: Record<TaskExecutionState, StatusVisual> = {
  canceled: VISUALS.canceled,
  failed: VISUALS.failed,
  outcome_unknown: { color: 'var(--ant-color-text-secondary)', icon: CircleHelpIcon },
  provisioning: { color: 'var(--ant-color-warning)', icon: Clock },
  queued: VISUALS.scheduled,
  running: VISUALS.running,
  succeeded: VISUALS.completed,
  waiting: VISUALS.waitingForHuman,
};
