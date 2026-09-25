import type {
  ChatTopicStatus,
  ProjectStatus,
  TaskStatus,
  TaskWorkflowCategory,
} from '@orvilo/types';
import { PROJECT_STATUSES } from '@orvilo/types';
import { cssVar } from 'antd-style';
import type { LucideIcon } from 'lucide-react';
import {
  Archive,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleDot,
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
  archived: { color: cssVar.colorTextDescription, icon: Archive },
  backlog: { color: cssVar.colorTextQuaternary, icon: CircleDot },
  canceled: { color: cssVar.orange, icon: CirclePause },
  completed: { color: cssVar.colorSuccess, icon: CircleCheck },
  failed: { color: cssVar.colorError, icon: CircleX },
  idle: { color: cssVar.colorTextTertiary, icon: Circle },
  running: { color: cssVar.colorWarning, icon: CircleDot },
  scheduled: { color: cssVar.colorWarning, icon: Clock },
  waitingForHuman: { color: cssVar.colorInfo, icon: HandIcon },
} satisfies Record<string, ExecutionStatusVisual>;

export const TASK_STATUS_VISUALS: Record<TaskStatus, ExecutionStatusVisual> = {
  backlog: VISUALS.backlog,
  canceled: VISUALS.canceled,
  completed: VISUALS.completed,
  failed: VISUALS.failed,
  // Task `paused` is surfaced as "Pending review" — Cordy's in-review
  // category, so it takes the review glyph (violet clock), not the
  // waiting-for-human hand a topic uses.
  paused: { color: cssVar.purple, icon: Clock },
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
  backlog: { color: cssVar.colorTextQuaternary, icon: WORKFLOW_CATEGORY_ICONS.backlog },
  canceled: { color: cssVar.colorTextDescription, icon: WORKFLOW_CATEGORY_ICONS.canceled },
  // Linear's brand indigo — the same paint the milestone diamond uses.
  done: { color: '#5e6ad2', icon: WORKFLOW_CATEGORY_ICONS.done },
  in_progress: { color: cssVar.colorWarning, icon: WORKFLOW_CATEGORY_ICONS.in_progress },
  in_review: { color: cssVar.colorSuccess, icon: WORKFLOW_CATEGORY_ICONS.in_review },
  todo: { color: cssVar.colorTextTertiary, icon: WORKFLOW_CATEGORY_ICONS.todo },
  triage: { color: cssVar.orange, icon: WORKFLOW_CATEGORY_ICONS.triage },
};

/**
 * The icon for the Status *property* (filter rows, bulk "Status" button,
 * context-menu "Status" submenu, "changed status" activity) — as opposed to
 * the per-value marks above. One mark, so the same field never reads as two.
 */
export const STATUS_PROPERTY_ICON: StatusIconComponent = StatusPropertyIcon;

/**
 * Project lifecycle marks follow Linear's project-status set, not the task
 * workflow set: dashed ring for backlog, hollow ring for planned, the traced
 * progress ring for in-progress, a filled check for completed and an X ring
 * for canceled — gray for everything not started, indigo only on done.
 * `paused`/`reviewing`/`archived` are Orvilo extensions with no Linear
 * counterpart; they keep quiet gray marks so the column still reads as one
 * axis.
 */
export const PROJECT_STATUS_VISUALS: Record<ProjectStatus, ExecutionStatusVisual> = {
  active: VISUALS.running,
  archived: VISUALS.archived,
  backlog: { color: cssVar.colorTextTertiary, icon: CircleDashed },
  canceled: { color: cssVar.colorTextDescription, icon: CircleX },
  completed: { color: cssVar.purple, icon: CircleCheck },
  paused: { color: cssVar.colorTextSecondary, icon: PauseCircle },
  planned: { color: cssVar.colorTextTertiary, icon: Circle },
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
  completed: { ...VISUALS.completed, color: cssVar.colorTextDescription },
  // A failed topic is an alert the user should act on, not a terminal outcome
  // like a failed task run — the warning triangle reads that way, the circled X
  // reads as "closed/rejected".
  failed: { ...VISUALS.failed, icon: TriangleAlert },
  running: VISUALS.running,
  scheduled: VISUALS.scheduled,
  // `unread` rows render a custom ripple dot; this is the fallback glyph.
  unread: { color: cssVar.colorInfo, icon: CircleDot },
  waitingForHuman: VISUALS.waitingForHuman,
};

/**
 * Synthetic sidebar group buckets that don't map 1:1 to a persisted status:
 * `favorite` is split out by `buildGroupedTopics`; `pending` collapses the
 * attention-needing states (waiting for human / failed / unread) and borrows
 * the waiting-for-human glyph since "needs your attention" is its semantic.
 */
export const TOPIC_GROUP_VISUALS = {
  favorite: { color: cssVar.colorTextTertiary, icon: StarIcon },
  pending: VISUALS.waitingForHuman,
} satisfies Record<string, ExecutionStatusVisual>;

export const EXECUTION_STATUS_VISUALS = VISUALS;
