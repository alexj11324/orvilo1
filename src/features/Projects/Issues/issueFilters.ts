import type {
  TaskStatus,
  TaskTriageStatus,
  WorkQueryFilter,
  WorkQueryPredicate,
} from '@orvilo/types';
import { TASK_STATUS_VALUES, TASK_TRIAGE_STATUS_VALUES } from '@orvilo/types';

/**
 * Applied-filter model for a project's issues list — the Linear "Add filter"
 * menu (my-issues BEHAVIORS §Filter inventory: AI filter / Advanced filter on
 * top, then the property directory). Filters serialize into the page URL as
 * repeated `?filter=` params, the same convention the projects list uses
 * (listFilters.ts), so a filtered list is shareable.
 *
 * The list itself is matched client-side over the complete `task.list` fetch —
 * the same reason `filterTasksByMilestone` is exact — so only fields the task
 * row honestly answers are interactive. `task.list` rows carry every field the
 * menu offers (including `labels` — the batched `taskLabel.listForTasks` join
 * on the list route), so no filter needs a second fetch.
 *
 * The project's milestones ride the separate `?projectMilestoneId=` param
 * (milestoneFilter.ts) — the menu still lists Milestones so the directory
 * matches the reference, but its picker writes that param and the existing
 * header chip stays the readout. Visibility stays with the header's own chip.
 * Relations, subscribers, links and template aren't modeled on tasks — they
 * render disabled rather than filtering on nothing.
 */

export const ISSUE_FILTER_PARAM = 'filter';

export const ISSUE_DATE_FIELDS = ['created', 'updated', 'completed'] as const;
export type IssueDateField = (typeof ISSUE_DATE_FIELDS)[number];

export const ISSUE_DATE_WINDOWS = ['set', 'unset', 'past', 'past30'] as const;
export type IssueDateWindow = (typeof ISSUE_DATE_WINDOWS)[number];

export type ProjectIssueFilter =
  | { type: 'status'; values: TaskStatus[] }
  | { type: 'priority'; values: number[] }
  | { type: 'assignee'; values: (string | null)[] }
  | { type: 'agent'; values: (string | null)[] }
  | { type: 'creator'; values: (string | null)[] }
  | { type: 'labels'; values: (string | null)[] }
  | { type: 'triage'; values: (TaskTriageStatus | null)[] }
  | { type: 'date'; field: IssueDateField; window: IssueDateWindow }
  | { type: 'text'; query: string };

export type ProjectIssueFilterGroupId =
  | 'status'
  | 'priority'
  | 'assignee'
  | 'agent'
  | 'creator'
  | 'labels'
  | 'milestone'
  | 'dates'
  | 'triage'
  | 'text'
  | 'relations'
  | 'subscribers'
  | 'links'
  | 'template';

/**
 * Directory order mirrors the reference's issue filter inventory (my-issues
 * BEHAVIORS §Filter inventory), minus the scopes that don't exist on a
 * project page (Team / Project / Agent Session are the scope itself).
 * `supported: false` rows are disabled so the directory still reads like
 * Linear without offering filters the task payload can't answer.
 */
export const PROJECT_ISSUE_FILTER_GROUPS: { id: ProjectIssueFilterGroupId; supported: boolean }[] =
  [
    { id: 'status', supported: true },
    { id: 'priority', supported: true },
    { id: 'assignee', supported: true },
    { id: 'agent', supported: true },
    { id: 'creator', supported: true },
    { id: 'labels', supported: true },
    { id: 'milestone', supported: true },
    { id: 'dates', supported: true },
    { id: 'triage', supported: true },
    { id: 'text', supported: true },
    { id: 'relations', supported: false },
    { id: 'subscribers', supported: false },
    { id: 'links', supported: false },
    { id: 'template', supported: false },
  ];

export const PRIORITY_FILTER_VALUES = [0, 1, 2, 3, 4] as const;

/** Token standing in for "no assignee / no creator / no label / not in triage". */
const NONE_TOKEN = 'none';

export const projectIssueFilterKey = (filter: ProjectIssueFilter): string =>
  filter.type === 'date' ? `date.${filter.field}` : filter.type;

// ── Matching ──

/** Structural subset of TaskItem/TaskListItem a filter needs. */
interface IssueFilterRow {
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  completedAt?: Date | string | null;
  createdAt?: Date | string | null;
  createdByUserId?: string | null;
  description?: string | null;
  id: string;
  instruction?: string | null;
  /** Label bindings — `task.list` joins them onto each row. */
  labels?: readonly { id: string }[] | null;
  name?: string | null;
  priority?: number | null;
  status?: string | null;
  triageStatus?: string | null;
  updatedAt?: Date | string | null;
}

const matchesNullableId = (value: string | null | undefined, values: readonly (string | null)[]) =>
  values.some((id) => (id === null ? !value : value === id));

const dayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const toTime = (value: Date | string | null | undefined) =>
  value ? new Date(value).getTime() : Number.NaN;

const matchesDateWindow = (
  value: Date | string | null | undefined,
  window: IssueDateWindow,
  now: Date,
) => {
  const time = toTime(value);
  const hasDate = !Number.isNaN(time);
  switch (window) {
    case 'set': {
      return hasDate;
    }
    case 'unset': {
      return !hasDate;
    }
    case 'past': {
      return hasDate && time < dayStart(now).getTime();
    }
    case 'past30': {
      return hasDate && time >= addDays(now, -30).getTime() && time <= now.getTime();
    }
  }
};

const dateFieldValue = (row: IssueFilterRow, field: IssueDateField) => {
  switch (field) {
    case 'created': {
      return row.createdAt;
    }
    case 'updated': {
      return row.updatedAt;
    }
    case 'completed': {
      return row.completedAt;
    }
  }
};

/**
 * One row against one applied filter. Labels match through the row's own
 * `labels` bindings — `task.list` batches them on, so no server round-trip
 * is needed to resolve a label predicate.
 */
export const matchesIssueFilter = (
  row: IssueFilterRow,
  filter: ProjectIssueFilter,
  now: Date = new Date(),
): boolean => {
  switch (filter.type) {
    case 'status': {
      return filter.values.length > 0 && filter.values.includes(row.status as TaskStatus);
    }
    case 'priority': {
      // Linear treats "no priority" as priority 0.
      return filter.values.includes(row.priority ?? 0);
    }
    case 'assignee': {
      return matchesNullableId(row.assigneeUserId, filter.values);
    }
    case 'agent': {
      return matchesNullableId(row.assigneeAgentId, filter.values);
    }
    case 'creator': {
      return matchesNullableId(row.createdByUserId, filter.values);
    }
    case 'labels': {
      const bound = row.labels?.map((label) => label.id) ?? [];
      return filter.values.some((id) => (id === null ? bound.length === 0 : bound.includes(id)));
    }
    case 'triage': {
      return filter.values.some(
        (value) =>
          (value === null && !row.triageStatus) || (value !== null && row.triageStatus === value),
      );
    }
    case 'date': {
      return matchesDateWindow(dateFieldValue(row, filter.field), filter.window, now);
    }
    case 'text': {
      const query = filter.query.trim().toLocaleLowerCase();
      if (!query) return true;
      return [row.name, row.description, row.instruction]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(query));
    }
  }
};

export const filterProjectIssueList = <T extends IssueFilterRow>(
  rows: readonly T[],
  filters: readonly ProjectIssueFilter[],
  now: Date = new Date(),
): T[] => rows.filter((row) => filters.every((filter) => matchesIssueFilter(row, filter, now)));

// ── URL round-trip ──

const isTaskStatus = (value: string): value is TaskStatus =>
  (TASK_STATUS_VALUES as readonly string[]).includes(value);

const isTriageStatus = (value: string): value is TaskTriageStatus =>
  (TASK_TRIAGE_STATUS_VALUES as readonly string[]).includes(value);

const isDateField = (value: string): value is IssueDateField =>
  (ISSUE_DATE_FIELDS as readonly string[]).includes(value);

const isDateWindow = (value: string): value is IssueDateWindow =>
  (ISSUE_DATE_WINDOWS as readonly string[]).includes(value);

const parseIds = (body: string): (string | null)[] => {
  const seen = new Set<string>();
  const ids: (string | null)[] = [];
  for (const raw of body.split(',')) {
    const id = raw.trim();
    if (!id) continue;
    const value = id === NONE_TOKEN ? null : id;
    const key = value ?? NONE_TOKEN;
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(value);
  }
  return ids;
};

const serializeIds = (values: readonly (string | null)[]) =>
  values.map((value) => value ?? NONE_TOKEN).join(',');

export const parseIssueFilterParam = (raw: string): ProjectIssueFilter | undefined => {
  const separator = raw.indexOf(':');
  if (separator <= 0) return undefined;
  const head = raw.slice(0, separator);
  const body = raw.slice(separator + 1);
  switch (head) {
    case 'status': {
      const values = body.split(',').filter(isTaskStatus);
      return values.length > 0 ? { type: 'status', values } : undefined;
    }
    case 'priority': {
      const values = [
        ...new Set(
          body
            .split(',')
            .map((value) => Number.parseInt(value, 10))
            .filter((value) => value >= 0 && value <= 4),
        ),
      ];
      return values.length > 0 ? { type: 'priority', values } : undefined;
    }
    case 'assignee':
    case 'agent':
    case 'creator':
    case 'labels': {
      const values = parseIds(body);
      return values.length > 0 ? { type: head, values } : undefined;
    }
    case 'triage': {
      const values = body
        .split(',')
        .map((value) => (value === NONE_TOKEN ? null : value))
        .filter(
          (value): value is TaskTriageStatus | null => value === null || isTriageStatus(value),
        );
      return values.length > 0 ? { type: 'triage', values } : undefined;
    }
    case 'text': {
      const query = body.trim();
      return query ? { type: 'text', query } : undefined;
    }
    default: {
      if (head.startsWith('date.')) {
        const field = head.slice('date.'.length);
        if (isDateField(field) && isDateWindow(body)) {
          return { type: 'date', field, window: body };
        }
      }
      return undefined;
    }
  }
};

export const serializeIssueFilterParam = (filter: ProjectIssueFilter): string | undefined => {
  switch (filter.type) {
    case 'status':
    case 'priority': {
      return filter.values.length > 0 ? `${filter.type}:${filter.values.join(',')}` : undefined;
    }
    case 'assignee':
    case 'agent':
    case 'creator':
    case 'labels': {
      return filter.values.length > 0 ? `${filter.type}:${serializeIds(filter.values)}` : undefined;
    }
    case 'triage': {
      return filter.values.length > 0 ? `${filter.type}:${serializeIds(filter.values)}` : undefined;
    }
    case 'date': {
      return `date.${filter.field}:${filter.window}`;
    }
    case 'text': {
      const query = filter.query.trim();
      return query ? `text:${query}` : undefined;
    }
  }
};

/**
 * Reads the applied filters from the search params — repeated `?filter=`
 * params. A duplicated key resolves first-wins, same as the projects list:
 * the writer never emits two clauses for one field.
 */
export const readProjectIssueFilters = (searchParams: URLSearchParams): ProjectIssueFilter[] => {
  const filters: ProjectIssueFilter[] = [];
  const seen = new Set<string>();
  for (const raw of searchParams.getAll(ISSUE_FILTER_PARAM)) {
    const parsed = parseIssueFilterParam(raw);
    if (!parsed) continue;
    const key = projectIssueFilterKey(parsed);
    if (seen.has(key)) continue;
    seen.add(key);
    filters.push(parsed);
  }
  return filters;
};

export const writeProjectIssueFilters = (
  searchParams: URLSearchParams,
  filters: readonly ProjectIssueFilter[],
): URLSearchParams => {
  const next = new URLSearchParams(searchParams);
  next.delete(ISSUE_FILTER_PARAM);
  for (const filter of filters) {
    const serialized = serializeIssueFilterParam(filter);
    if (serialized) next.append(ISSUE_FILTER_PARAM, serialized);
  }
  return next;
};

export const removeProjectIssueFilter = (
  filters: readonly ProjectIssueFilter[],
  key: string,
): ProjectIssueFilter[] => filters.filter((filter) => projectIssueFilterKey(filter) !== key);

export const upsertProjectIssueFilter = (
  filters: readonly ProjectIssueFilter[],
  next: ProjectIssueFilter,
): ProjectIssueFilter[] => {
  const key = projectIssueFilterKey(next);
  const index = filters.findIndex((filter) => projectIssueFilterKey(filter) === key);
  const serialized = serializeIssueFilterParam(next);
  if (!serialized) {
    // An emptied value set removes the filter (same rule the URL applies).
    return index === -1 ? [...filters] : filters.filter((_, i) => i !== index);
  }
  if (index === -1) return [...filters, next];
  const copy = [...filters];
  copy[index] = next;
  return copy;
};

// ── WorkQuery bridge (seeds "Save as new view" / Advanced filter, and the
//    server-side label narrowing) ──

const orNodes = (predicates: WorkQueryPredicate[]): WorkQueryFilter | WorkQueryPredicate =>
  predicates.length === 1 ? predicates[0] : { any: predicates };

/**
 * Maps one applied filter to WorkQuery AST nodes. Returns undefined when the
 * field isn't part of the task work-query registry (dates, free text, the
 * agent assignee — `assigneeAgentId` is not a WorkQueryField) — those stay
 * URL-only and never feed a saved view.
 */
const issueFilterToQueryNodes = (
  filter: ProjectIssueFilter,
): (WorkQueryPredicate | WorkQueryFilter)[] | undefined => {
  switch (filter.type) {
    case 'status': {
      return filter.values.length > 0
        ? [{ field: 'status', op: 'in', value: [...filter.values] }]
        : undefined;
    }
    case 'priority': {
      const predicates = filter.values.map((value): WorkQueryPredicate => ({
        field: 'priority',
        op: 'eq',
        value,
      }));
      return predicates.length > 0 ? [orNodes(predicates)] : undefined;
    }
    case 'assignee':
    case 'creator': {
      const field = filter.type === 'assignee' ? 'assigneeUserId' : 'createdByUserId';
      // `createdByUserId` has no `isNull` op in the task field spec, so the
      // "no creator" value simply cannot seed a saved view — it's skipped,
      // not silently compiled to something the backend would reject.
      const predicates = filter.values.flatMap((value): WorkQueryPredicate[] =>
        value === null
          ? filter.type === 'assignee'
            ? [{ field, op: 'isNull' }]
            : []
          : [{ field, op: 'eq', value }],
      );
      return predicates.length > 0 ? [orNodes(predicates)] : undefined;
    }
    case 'labels': {
      const predicates = filter.values.map((value): WorkQueryPredicate =>
        value === null ? { field: 'labelId', op: 'isNull' } : { field: 'labelId', op: 'eq', value },
      );
      return predicates.length > 0 ? [orNodes(predicates)] : undefined;
    }
    case 'triage': {
      const predicates = filter.values.map((value): WorkQueryPredicate =>
        value === null
          ? { field: 'triageStatus', op: 'isNull' }
          : { field: 'triageStatus', op: 'eq', value },
      );
      return predicates.length > 0 ? [orNodes(predicates)] : undefined;
    }
    case 'agent':
    case 'date':
    case 'text': {
      return undefined;
    }
  }
};

/**
 * Seeds a saved view from the current project issues page: a mandatory
 * `projectId eq` predicate plus every expressible applied filter, ANDed
 * together. Nested `any` groups carry the OR-within-one-field semantics.
 */
export const projectIssuesViewFilterSeed = (
  projectId: string,
  filters: readonly ProjectIssueFilter[],
): WorkQueryFilter => {
  const all: (WorkQueryFilter | WorkQueryPredicate)[] = [
    { field: 'projectId', op: 'eq', value: projectId },
  ];
  for (const filter of filters) {
    const nodes = issueFilterToQueryNodes(filter);
    if (nodes) all.push(...nodes);
  }
  return { all };
};

/* -------------------------------- AI filter ------------------------------- */

/**
 * Local keyword → filter parser behind the "AI filter" entry — same approach
 * the projects list documents (`parseAiProjectFilters`): an honest phrase
 * parser covering the obvious cases (status names, priorities, "me",
 * member/agent/label names, the common date phrases, triage) until the real
 * NL→filter path lands. Anything unrecognised degrades to the `text` filter —
 * a title/description contains — which the chip labels plainly rather than
 * pretending a smarter interpretation.
 */

export interface AiIssueFilterContext {
  /** Sidebar agents for name → id resolution. */
  agents?: readonly { id: string; name: string }[];
  currentUserId?: string;
  /** Workspace label registry for name → id resolution. */
  labels?: readonly { id: string; name: string }[];
  /** Workspace members for name → id resolution (fullName or username). */
  members?: readonly { name: string; userId: string }[];
}

/**
 * Substring match where ASCII phrases additionally require non-alphanumeric
 * boundaries, so `done` never fires inside `undone`. CJK phrases have no
 * word boundary concept and match as plain substrings.
 */
const containsPhrase = (text: string, phrase: string): boolean => {
  const index = text.indexOf(phrase);
  if (index === -1) return false;
  if (/^[\x20-\x7E]+$/.test(phrase)) {
    const before = text[index - 1];
    const after = text[index + phrase.length];
    if (before && /[a-z0-9]/.test(before)) return false;
    if (after && /[a-z0-9]/.test(after)) return false;
  }
  return true;
};

const ISSUE_STATUS_PHRASES: readonly (readonly [TaskStatus, string[]])[] = [
  ['backlog', ['backlog', '待办']],
  ['running', ['running', 'in progress', '进行中', '运行中']],
  ['scheduled', ['scheduled', '已排期', '已计划']],
  ['paused', ['paused', 'on hold', 'in review', 'pending review', '已暂停', '待审核']],
  ['completed', ['completed', 'complete', 'done', '已完成']],
  ['failed', ['failed', '失败']],
  ['canceled', ['cancelled', 'canceled', '已取消']],
];

const ISSUE_PRIORITY_PHRASES: readonly (readonly [number, string[]])[] = [
  [1, ['urgent', 'p1', '紧急']],
  [2, ['high priority', 'high', 'p2', '高优先级']],
  [3, ['medium priority', 'medium', 'normal priority', 'normal', 'p3', '中优先级', '中等']],
  [4, ['low priority', 'low', 'p4', '低优先级']],
  [0, ['no priority', 'unprioritized', 'p0', '无优先级']],
];

const ISSUE_DATE_PHRASES: readonly {
  field: IssueDateField;
  phrases: string[];
  window: IssueDateWindow;
}[] = [
  {
    field: 'updated',
    phrases: ['recently updated', 'updated recently', '最近更新'],
    window: 'past30',
  },
  {
    field: 'created',
    phrases: ['recently created', 'created recently', 'newly created', '最近创建'],
    window: 'past30',
  },
  {
    field: 'completed',
    phrases: ['recently completed', 'completed recently', '最近完成'],
    window: 'past30',
  },
  {
    field: 'completed',
    phrases: ['unfinished', 'not completed', 'incomplete', '未完成', '没完成'],
    window: 'unset',
  },
];

const ISSUE_MY_ASSIGNEE_PHRASES = [
  'assigned to me',
  'my issues',
  'my tasks',
  'mine',
  '分配给我',
  '我的',
];
const ISSUE_NO_ASSIGNEE_PHRASES = [
  'unassigned',
  'no assignee',
  'without assignee',
  '未分配',
  '无人认领',
];
const ISSUE_MY_CREATOR_PHRASES = ['created by me', 'i created', '我创建的', '由我创建'];
const ISSUE_UNTRIAGED_PHRASES = ['untriaged', 'needs triage', 'in triage', '待分类', '待分流'];
const ISSUE_NO_LABEL_PHRASES = ['unlabeled', 'no label', 'without label', '无标签', '没有标签'];

const mergeValues = (a: readonly unknown[], b: readonly unknown[]): unknown[] => [
  ...new Set([...a, ...b]),
];

const mergeFilter = (
  filters: ProjectIssueFilter[],
  next: ProjectIssueFilter,
): ProjectIssueFilter[] => {
  const key = projectIssueFilterKey(next);
  const existing = filters.find((filter) => projectIssueFilterKey(filter) === key);
  // Same field → union the value sets ("urgent high" = priority:{1,2}).
  if (existing && 'values' in existing && 'values' in next) {
    const merged = {
      ...existing,
      values: mergeValues(existing.values, next.values),
    } as ProjectIssueFilter;
    return filters.map((filter) => (projectIssueFilterKey(filter) === key ? merged : filter));
  }
  return upsertProjectIssueFilter(filters, next);
};

/**
 * Parse a natural-language filter description into issue filters. Falls back
 * to a `text` (title/description contains) filter when nothing else matches —
 * the chip shows the interpretation instead of an error, and it is always a
 * real predicate on real fields.
 */
export const parseAiIssueFilters = (
  text: string,
  context: AiIssueFilterContext = {},
): ProjectIssueFilter[] => {
  const normalized = text.trim().toLocaleLowerCase();
  if (!normalized) return [];

  let filters: ProjectIssueFilter[] = [];
  const statuses: TaskStatus[] = [];
  const priorities: number[] = [];

  for (const [status, phrases] of ISSUE_STATUS_PHRASES) {
    if (phrases.some((phrase) => containsPhrase(normalized, phrase))) statuses.push(status);
  }
  if (statuses.length > 0) filters.push({ type: 'status', values: statuses });

  for (const [priority, phrases] of ISSUE_PRIORITY_PHRASES) {
    if (phrases.some((phrase) => containsPhrase(normalized, phrase))) priorities.push(priority);
  }
  if (priorities.length > 0) filters.push({ type: 'priority', values: priorities });

  for (const { field, phrases, window } of ISSUE_DATE_PHRASES) {
    if (phrases.some((phrase) => containsPhrase(normalized, phrase))) {
      filters = mergeFilter(filters, { field, type: 'date', window });
    }
  }

  if (ISSUE_UNTRIAGED_PHRASES.some((phrase) => containsPhrase(normalized, phrase))) {
    filters = mergeFilter(filters, { type: 'triage', values: ['untriaged'] });
  }

  // People: explicit assignee/creator context first, then "me", then a bare
  // member name defaults to assignee (the issues list's most likely intent).
  if (ISSUE_NO_ASSIGNEE_PHRASES.some((phrase) => containsPhrase(normalized, phrase))) {
    filters = mergeFilter(filters, { type: 'assignee', values: [null] });
  }
  if (
    context.currentUserId &&
    ISSUE_MY_ASSIGNEE_PHRASES.some((phrase) => containsPhrase(normalized, phrase))
  ) {
    filters = mergeFilter(filters, { type: 'assignee', values: [context.currentUserId] });
  }
  if (
    context.currentUserId &&
    ISSUE_MY_CREATOR_PHRASES.some((phrase) => containsPhrase(normalized, phrase))
  ) {
    filters = mergeFilter(filters, { type: 'creator', values: [context.currentUserId] });
  }

  // Longest names first so "Orvilo Core" beats "Orvilo" inside the same text.
  const members = [...(context.members ?? [])].sort((a, b) => b.name.length - a.name.length);
  for (const member of members) {
    const name = member.name.trim().toLocaleLowerCase();
    if (name.length < 2 || !containsPhrase(normalized, name)) continue;
    const target =
      normalized.includes('created by') || normalized.includes('创建') ? 'creator' : 'assignee';
    filters = mergeFilter(
      filters,
      target === 'creator'
        ? { type: 'creator', values: [member.userId] }
        : { type: 'assignee', values: [member.userId] },
    );
  }

  const agents = [...(context.agents ?? [])].sort((a, b) => b.name.length - a.name.length);
  for (const agent of agents) {
    const name = agent.name.trim().toLocaleLowerCase();
    if (name.length >= 2 && containsPhrase(normalized, name)) {
      filters = mergeFilter(filters, { type: 'agent', values: [agent.id] });
    }
  }

  if (ISSUE_NO_LABEL_PHRASES.some((phrase) => containsPhrase(normalized, phrase))) {
    filters = mergeFilter(filters, { type: 'labels', values: [null] });
  }
  const labels = [...(context.labels ?? [])].sort((a, b) => b.name.length - a.name.length);
  for (const label of labels) {
    const name = label.name.trim().toLocaleLowerCase();
    if (name.length >= 2 && containsPhrase(normalized, name)) {
      filters = mergeFilter(filters, { type: 'labels', values: [label.id] });
    }
  }

  // Unrecognised text still filters honestly — title/description contains.
  return filters.length > 0 ? filters : [{ type: 'text', query: text.trim() }];
};
