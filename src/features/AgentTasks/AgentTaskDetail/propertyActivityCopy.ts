import type { TaskActivityIssueRef, TaskDetailPropertyChange } from '@orvilo/types';

/**
 * A value inside a feed sentence, described rather than rendered so the choice
 * of wording can be asserted without mounting the feed.
 *
 * - `text` — a value that is already words (a title, a team state name).
 * - `label` — a translation key the row resolves (a workflow category, or
 *   the name used when the real one is gone).
 * - `issue` — another Issue; rendered as a link, or as the "unavailable"
 *   label when the reader cannot be shown it.
 * - `link` — an external link or pull request.
 */
export type PropertyActivitySlot =
  | { key: PropertyActivityLabelKey; kind: 'label' }
  | { kind: 'issue'; ref: TaskActivityIssueRef }
  | { kind: 'link'; title: string | null; url: string | null }
  | { kind: 'text'; text: string };

export type PropertyActivityLabelKey =
  | 'taskDetail.activities.unavailable.label'
  | 'taskDetail.activities.unavailable.milestone'
  | 'taskDetail.activities.unavailable.project'
  | 'taskDetail.activities.unavailable.team'
  | 'taskDetail.activities.unavailable.title'
  | `taskDetail.workflow.category.${
      'backlog' | 'canceled' | 'done' | 'in_progress' | 'in_review' | 'todo' | 'triage'}`;

export type PropertyActivitySentenceKey =
  | 'taskDetail.activities.description.edited'
  | 'taskDetail.activities.dueDate.changed'
  | 'taskDetail.activities.dueDate.removed'
  | 'taskDetail.activities.dueDate.set'
  | 'taskDetail.activities.duplicate.cleared'
  | 'taskDetail.activities.duplicate.set'
  | 'taskDetail.activities.label.added'
  | 'taskDetail.activities.label.removed'
  | 'taskDetail.activities.milestone.changed'
  | 'taskDetail.activities.milestone.removed'
  | 'taskDetail.activities.milestone.set'
  | 'taskDetail.activities.parent.changed'
  | 'taskDetail.activities.parent.removed'
  | 'taskDetail.activities.parent.set'
  | 'taskDetail.activities.project.changed'
  | 'taskDetail.activities.project.removed'
  | 'taskDetail.activities.project.set'
  | 'taskDetail.activities.relation.blockedBy.added'
  | 'taskDetail.activities.relation.blockedBy.removed'
  | 'taskDetail.activities.relation.blocking.added'
  | 'taskDetail.activities.relation.blocking.removed'
  | 'taskDetail.activities.relation.related.added'
  | 'taskDetail.activities.relation.related.removed'
  | 'taskDetail.activities.resource.link.added'
  | 'taskDetail.activities.resource.link.removed'
  | 'taskDetail.activities.resource.pullRequest.added'
  | 'taskDetail.activities.resource.pullRequest.removed'
  | 'taskDetail.activities.status.changed'
  | 'taskDetail.activities.subIssue.added'
  | 'taskDetail.activities.subIssue.removed'
  | 'taskDetail.activities.team.changed'
  | 'taskDetail.activities.team.removed'
  | 'taskDetail.activities.team.set'
  | 'taskDetail.activities.title.changed'
  | 'taskDetail.activities.verify.changed'
  | 'taskDetail.activities.workflow.set';

export interface PropertyActivityCopy {
  /** One whole sentence per kind — the verb's position is the translation's business. */
  key: PropertyActivitySentenceKey;
  /** Values for the sentence's `<from/>`, `<to/>`, `<target/>` … placeholders. */
  slots: Record<string, PropertyActivitySlot>;
}

/** The fields this resolver words; status, priority and automation keep their own renderers. */
export type DescribedPropertyChange = Exclude<
  TaskDetailPropertyChange,
  { field: 'automation' | 'priority' | 'status' }
>;

const text = (value: string): PropertyActivitySlot => ({ kind: 'text', text: value });
const label = (key: PropertyActivityLabelKey): PropertyActivitySlot => ({ key, kind: 'label' });
const issue = (ref: TaskActivityIssueRef): PropertyActivitySlot => ({ kind: 'issue', ref });

/** A name that may have been lost: empty means "there was one, we no longer know what it was called". */
const named = (value: string, fallback: PropertyActivityLabelKey): PropertyActivitySlot =>
  value ? text(value) : label(fallback);

/** Absolute dates read `YYYY/MM/DD` everywhere in the product. */
export const formatActivityDate = (value: string): string =>
  /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10).replaceAll('-', '/') : value;

/**
 * "Set", "changed" or "removed", from which sides of the change exist — the
 * three shapes every optional property has. `null` when neither side exists:
 * nothing happened, and no sentence should claim otherwise.
 */
const direction = <T>(from: T | null, to: T | null): 'changed' | 'removed' | 'set' | null =>
  from !== null && to !== null ? 'changed' : to !== null ? 'set' : from !== null ? 'removed' : null;

/**
 * Pick the sentence and its values for one property row.
 *
 * Kept apart from the component because the wording has real branches (which
 * side of a change exists, which way a relation points) and none of them
 * needs React to decide.
 */
export const resolvePropertyActivityCopy = (
  change: DescribedPropertyChange,
): PropertyActivityCopy | null => {
  switch (change.field) {
    case 'workflow': {
      // The team state's own name when the Issue had one, otherwise the category.
      const side = (value: { category: string; name?: string | null }): PropertyActivitySlot =>
        value.name
          ? text(value.name)
          : label(`taskDetail.workflow.category.${value.category}` as PropertyActivityLabelKey);
      return change.from
        ? {
            key: 'taskDetail.activities.status.changed',
            slots: { from: side(change.from), to: side(change.to) },
          }
        : { key: 'taskDetail.activities.workflow.set', slots: { to: side(change.to) } };
    }
    case 'description': {
      return { key: 'taskDetail.activities.description.edited', slots: {} };
    }
    case 'verify': {
      return { key: 'taskDetail.activities.verify.changed', slots: {} };
    }
    case 'title': {
      const side = (value: string | null) =>
        named(value ?? '', 'taskDetail.activities.unavailable.title');
      return {
        key: 'taskDetail.activities.title.changed',
        slots: { from: side(change.from), to: side(change.to) },
      };
    }
    case 'dueDate': {
      const kind = direction(change.from, change.to);
      if (!kind) return null;
      return {
        key: `taskDetail.activities.dueDate.${kind}`,
        slots: {
          ...(change.from ? { from: text(formatActivityDate(change.from)) } : {}),
          ...(change.to ? { to: text(formatActivityDate(change.to)) } : {}),
        },
      };
    }
    case 'parent': {
      const kind = direction(change.from, change.to);
      if (!kind) return null;
      return {
        key: `taskDetail.activities.parent.${kind}`,
        slots: {
          ...(change.from ? { from: issue(change.from) } : {}),
          ...(change.to ? { to: issue(change.to) } : {}),
        },
      };
    }
    case 'duplicate': {
      return change.to
        ? { key: 'taskDetail.activities.duplicate.set', slots: { target: issue(change.to) } }
        : { key: 'taskDetail.activities.duplicate.cleared', slots: {} };
    }
    case 'relation': {
      const group =
        change.relation === 'sub_issue'
          ? 'subIssue'
          : change.relation === 'blocked_by'
            ? 'relation.blockedBy'
            : change.relation === 'blocking'
              ? 'relation.blocking'
              : 'relation.related';
      return {
        key: `taskDetail.activities.${group}.${change.action}`,
        slots: { target: issue(change.target) },
      };
    }
    case 'label': {
      return {
        key: `taskDetail.activities.label.${change.action}`,
        slots: { label: named(change.name ?? '', 'taskDetail.activities.unavailable.label') },
      };
    }
    case 'project':
    case 'milestone':
    case 'team': {
      const kind = direction(change.from, change.to);
      if (!kind) return null;
      const fallback = `taskDetail.activities.unavailable.${change.field}` as const;
      return {
        key: `taskDetail.activities.${change.field}.${kind}`,
        slots: {
          ...(change.from === null ? {} : { from: named(change.from, fallback) }),
          ...(change.to === null ? {} : { to: named(change.to, fallback) }),
        },
      };
    }
    case 'resource': {
      return {
        key: `taskDetail.activities.resource.${
          change.kind === 'pull_request' ? 'pullRequest' : 'link'
        }.${change.action}`,
        slots: { link: { kind: 'link', title: change.title, url: change.url } },
      };
    }
  }
};
