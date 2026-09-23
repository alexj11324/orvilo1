import type { ProjectHealth, ProjectStatus } from '@orvilo/types';
import { PROJECT_HEALTH_STATES, PROJECT_STATUSES } from '@orvilo/types';

/**
 * Applied-filter model for the `/projects` list — the Linear "Add filter"
 * surface (ref-projects-filter-menu.png, NEW-FINDINGS §6): AI filter +
 * Advanced filter on top, then the property groups Status / Priority /
 * Labels / Teams / Lead / Members / Creator / Health / Dates / Milestones /
 * Relations / Template / Title & summary / Specific project.
 *
 * Only groups the `project.list` row payload can honestly answer are
 * interactive: status, priority, lead, creator (`projects.user_id`), health,
 * the five date columns, title/summary text and a specific-project id set.
 * Labels, teams, members, milestones, relations and template exist only on
 * the detail/planning payloads — filtering by them here would silently miss
 * unloaded projects, so they render disabled in the menu (never fake).
 *
 * Filters serialize into the page URL as repeated `?filter=` params —
 * Linear reflects applied filters in the browser URL, and MyWork already
 * carries its filter chips the same way.
 */

/* --------------------------------- Model ---------------------------------- */

export const PROJECT_LIST_DATE_FIELDS = [
  'startDate',
  'targetDate',
  'created',
  'updated',
  'completed',
] as const;
export type ProjectListDateField = (typeof PROJECT_LIST_DATE_FIELDS)[number];

export const PROJECT_LIST_DATE_WINDOWS = [
  'set',
  'unset',
  'past',
  'past30',
  'next7',
  'next30',
  'next90',
] as const;
export type ProjectListDateWindow = (typeof PROJECT_LIST_DATE_WINDOWS)[number];

export type ProjectListFilter =
  | { type: 'status'; values: ProjectStatus[] }
  | { type: 'priority'; values: number[] }
  | { type: 'lead'; values: (string | null)[] }
  | { type: 'creator'; values: (string | null)[] }
  | { type: 'health'; values: (ProjectHealth | null)[] }
  | { type: 'date'; field: ProjectListDateField; window: ProjectListDateWindow }
  | { type: 'text'; query: string }
  | { type: 'projects'; ids: string[] };

/**
 * Identity used for upsert/remove — one filter per field (a second Status
 * pick rewrites the status chip, it doesn't stack a second one). Date
 * filters key on `field` too: "Target in the next 7 days" and "Created in
 * the last 30 days" coexist.
 */
export const projectListFilterKey = (filter: ProjectListFilter): string =>
  filter.type === 'date' ? `date.${filter.field}` : filter.type;

/** Reference group order; `supported` groups open a value picker, the rest render honest-disabled. */
export const PROJECT_LIST_FILTER_GROUPS = [
  { id: 'status', supported: true },
  { id: 'priority', supported: true },
  { id: 'labels', supported: false },
  { id: 'teams', supported: false },
  { id: 'lead', supported: true },
  { id: 'members', supported: false },
  { id: 'creator', supported: true },
  { id: 'health', supported: true },
  { id: 'dates', supported: true },
  { id: 'milestones', supported: false },
  { id: 'relations', supported: false },
  { id: 'template', supported: false },
  { id: 'text', supported: true },
  { id: 'projects', supported: true },
] as const;
export type ProjectListFilterGroupId = (typeof PROJECT_LIST_FILTER_GROUPS)[number]['id'];

/* -------------------------------- Predicate ------------------------------- */

export interface ProjectListFilterRow {
  completedAt?: Date | null | string;
  createdAt?: Date | null | string;
  health?: null | string;
  id: string;
  leadUserId?: null | string;
  name: string;
  priority?: null | number;
  startDate?: null | string;
  status?: null | string;
  summary?: null | string;
  targetDate?: null | string;
  updatedAt?: Date | null | string;
  userId?: null | string;
}

const timeOf = (value: Date | null | string | undefined): number | null => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

const dayStart = (now: Date) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

const DAY_MS = 86_400_000;

const DATE_FIELD_KEYS: Record<ProjectListDateField, keyof ProjectListFilterRow> = {
  completed: 'completedAt',
  created: 'createdAt',
  startDate: 'startDate',
  targetDate: 'targetDate',
  updated: 'updatedAt',
};

/**
 * `past` = before today (a target date in the past reads "overdue", matching
 * the reference's "in the past" choice on Dates). `nextN` spans
 * today→now+N — the upper bound anchors to `now`, not today's start, so a
 * date-only value parsed in a timezone ahead of UTC still lands inside.
 */
const matchesDateWindow = (
  value: Date | null | string | undefined,
  window: ProjectListDateWindow,
  now: Date,
): boolean => {
  const time = timeOf(value);
  const today = dayStart(now);
  switch (window) {
    case 'set': {
      return time !== null;
    }
    case 'unset': {
      return time === null;
    }
    case 'past': {
      return time !== null && time < today;
    }
    case 'past30': {
      return time !== null && time <= now.getTime() && time >= now.getTime() - 30 * DAY_MS;
    }
    case 'next7':
    case 'next30':
    case 'next90': {
      const days = window === 'next7' ? 7 : window === 'next30' ? 30 : 90;
      return time !== null && time >= today && time <= now.getTime() + days * DAY_MS;
    }
  }
};

const matchesUserFilter = (
  rowValue: null | string | undefined,
  values: readonly (string | null)[],
): boolean => values.some((value) => (value === null ? !rowValue : rowValue === value));

const matchesFilter = (
  project: ProjectListFilterRow,
  filter: ProjectListFilter,
  now: Date,
): boolean => {
  switch (filter.type) {
    case 'status': {
      return filter.values.includes(project.status as ProjectStatus);
    }
    case 'priority': {
      // Unset/invalid priorities normalize to 0 ("no priority"), the same
      // rule the Priority column renders with.
      const priority =
        typeof project.priority === 'number' && project.priority >= 0 && project.priority <= 4
          ? project.priority
          : 0;
      return filter.values.includes(priority);
    }
    case 'lead': {
      return matchesUserFilter(project.leadUserId, filter.values);
    }
    case 'creator': {
      return matchesUserFilter(project.userId, filter.values);
    }
    case 'health': {
      return filter.values.some((value) =>
        value === null ? !project.health : project.health === value,
      );
    }
    case 'date': {
      return matchesDateWindow(
        project[DATE_FIELD_KEYS[filter.field]] as Date | null | string | undefined,
        filter.window,
        now,
      );
    }
    case 'text': {
      const needle = filter.query.trim().toLocaleLowerCase();
      if (!needle) return true;
      return [project.name, project.summary]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(needle));
    }
    case 'projects': {
      return filter.ids.includes(project.id);
    }
  }
};

/** AND across filters, OR within one filter's value set — Linear's conjunctive semantics. */
export const filterProjectList = <T extends ProjectListFilterRow>(
  projects: T[],
  filters: readonly ProjectListFilter[],
  now: Date = new Date(),
): T[] => {
  if (filters.length === 0) return projects;
  return projects.filter((project) =>
    filters.every((filter) => matchesFilter(project, filter, now)),
  );
};

/* --------------------------------- Editing -------------------------------- */

const isEmptyFilter = (filter: ProjectListFilter): boolean => {
  switch (filter.type) {
    case 'text': {
      return filter.query.trim().length === 0;
    }
    case 'projects': {
      return filter.ids.length === 0;
    }
    case 'date': {
      return false;
    }
    default: {
      return filter.values.length === 0;
    }
  }
};

/**
 * Insert or replace the filter that owns `projectListFilterKey(filter)`;
 * an emptied value set removes the chip instead of leaving a dead clause.
 */
export const upsertProjectListFilter = (
  filters: readonly ProjectListFilter[],
  filter: ProjectListFilter,
): ProjectListFilter[] => {
  const key = projectListFilterKey(filter);
  const rest = filters.filter((item) => projectListFilterKey(item) !== key);
  return isEmptyFilter(filter) ? rest : [...rest, filter];
};

export const removeProjectListFilter = (
  filters: readonly ProjectListFilter[],
  key: string,
): ProjectListFilter[] => filters.filter((item) => projectListFilterKey(item) !== key);

/* ------------------------------ URL round-trip ---------------------------- */

export const PROJECT_LIST_FILTER_PARAM = 'filter';

/** URL token for the null member/health choice — real ids can't collide with it. */
const NONE_TOKEN = 'none';

const isProjectStatus = (value: string): value is ProjectStatus =>
  (PROJECT_STATUSES as readonly string[]).includes(value);
const isProjectHealth = (value: string): value is ProjectHealth =>
  (PROJECT_HEALTH_STATES as readonly string[]).includes(value);
const isDateField = (value: string): value is ProjectListDateField =>
  (PROJECT_LIST_DATE_FIELDS as readonly string[]).includes(value);
const isDateWindow = (value: string): value is ProjectListDateWindow =>
  (PROJECT_LIST_DATE_WINDOWS as readonly string[]).includes(value);

export const serializeProjectListFilter = (filter: ProjectListFilter): string => {
  switch (filter.type) {
    case 'status': {
      return `status:${filter.values.join(',')}`;
    }
    case 'priority': {
      return `priority:${filter.values.join(',')}`;
    }
    case 'lead':
    case 'creator': {
      return `${filter.type}:${filter.values.map((value) => value ?? NONE_TOKEN).join(',')}`;
    }
    case 'health': {
      return `health:${filter.values.map((value) => value ?? NONE_TOKEN).join(',')}`;
    }
    case 'date': {
      return `date.${filter.field}:${filter.window}`;
    }
    case 'text': {
      return `text:${filter.query}`;
    }
    case 'projects': {
      return `projects:${filter.ids.join(',')}`;
    }
  }
};

/**
 * Parse one `?filter=` entry; unknown types and unknown values drop out
 * (the URL is hand-editable), and an entry left with no valid values
 * disappears entirely rather than filtering nothing/everything.
 */
export const parseProjectListFilter = (raw: string): ProjectListFilter | undefined => {
  const separator = raw.indexOf(':');
  if (separator <= 0) return undefined;
  const head = raw.slice(0, separator);
  const body = raw.slice(separator + 1);
  const parts = body.split(',').filter(Boolean);

  if (head.startsWith('date.')) {
    const field = head.slice(5);
    return isDateField(field) && isDateWindow(body)
      ? { field, type: 'date', window: body }
      : undefined;
  }

  switch (head) {
    case 'status': {
      const values = parts.filter(isProjectStatus);
      return values.length > 0 ? { type: 'status', values } : undefined;
    }
    case 'priority': {
      const values = [
        ...new Set(
          parts
            .map((part) => Number(part))
            .filter((value) => Number.isInteger(value) && value >= 0 && value <= 4),
        ),
      ];
      return values.length > 0 ? { type: 'priority', values } : undefined;
    }
    case 'lead':
    case 'creator': {
      const values = parts.map((part) => (part === NONE_TOKEN ? null : part));
      return values.length > 0 ? { type: head, values } : undefined;
    }
    case 'health': {
      const values = parts
        .map((part) => (part === NONE_TOKEN ? null : part))
        .filter((value): value is ProjectHealth | null => value === null || isProjectHealth(value));
      return values.length > 0 ? { type: 'health', values } : undefined;
    }
    case 'text': {
      const query = body.trim();
      return query ? { query, type: 'text' } : undefined;
    }
    case 'projects': {
      return parts.length > 0 ? { ids: [...new Set(parts)], type: 'projects' } : undefined;
    }
    default: {
      return undefined;
    }
  }
};

/** Read all `?filter=` entries, deduplicated by filter key (first wins). */
export const readProjectListFilters = (params: URLSearchParams): ProjectListFilter[] => {
  const seen = new Set<string>();
  const filters: ProjectListFilter[] = [];
  for (const raw of params.getAll(PROJECT_LIST_FILTER_PARAM)) {
    const filter = parseProjectListFilter(raw);
    if (!filter) continue;
    const key = projectListFilterKey(filter);
    if (seen.has(key)) continue;
    seen.add(key);
    filters.push(filter);
  }
  return filters;
};

/** Rewrite the `filter` params, preserving any unrelated params the page grows later. */
export const writeProjectListFilters = (
  params: URLSearchParams,
  filters: readonly ProjectListFilter[],
): URLSearchParams => {
  const next = new URLSearchParams(params);
  next.delete(PROJECT_LIST_FILTER_PARAM);
  for (const filter of filters) {
    next.append(PROJECT_LIST_FILTER_PARAM, serializeProjectListFilter(filter));
  }
  return next;
};

/* -------------------------------- AI filter ------------------------------- */

/**
 * Local keyword → filter parser behind the "AI filter" entry. The real
 * NL→filter path needs the WorkQuery AI procedure the feasibility doc scopes
 * (features-feasibility §2 — judgment binding + field registry prompt);
 * until that lands, this honest parser covers the obvious cases — status
 * names, priorities, health, lead/creator names, "me", and the common date
 * phrases — and reports no-match instead of hallucinating clauses.
 */

export interface AiProjectFilterContext {
  currentUserId?: string;
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

const STATUS_PHRASES: readonly (readonly [ProjectStatus, string[]])[] = [
  ['active', ['in progress', 'active', '进行中', '推进中']],
  ['backlog', ['backlog', '待办', '待启动']],
  ['planned', ['planned', '已计划']],
  ['paused', ['on hold', 'paused', '已暂停']],
  ['reviewing', ['in review', 'reviewing', '待验收', '审核中']],
  ['completed', ['completed', 'complete', 'done', '已完成']],
  ['canceled', ['cancelled', 'canceled', '已取消']],
  ['archived', ['archived', 'archive', '已归档']],
];

const PRIORITY_PHRASES: readonly (readonly [number, string[]])[] = [
  [1, ['urgent', 'p1', '紧急']],
  [2, ['high priority', 'high', 'p2', '高优先级']],
  [3, ['medium priority', 'medium', 'normal priority', 'normal', 'p3', '中优先级', '中等']],
  [4, ['low priority', 'low', 'p4', '低优先级']],
  [0, ['no priority', 'unprioritized', 'p0', '无优先级']],
];

const HEALTH_PHRASES: readonly (readonly [ProjectHealth | null, string[]])[] = [
  [null, ['no updates', 'no health', '无更新']],
  ['onTrack', ['on track', 'on-track', '按期', '正常推进']],
  ['atRisk', ['at risk', 'at-risk', '有风险']],
  ['offTrack', ['off track', 'off-track', '偏离轨道']],
];

const DATE_PHRASES: readonly {
  field: ProjectListDateField;
  phrases: string[];
  window: ProjectListDateWindow;
}[] = [
  { field: 'targetDate', phrases: ['overdue', 'past due', '已逾期', '逾期'], window: 'past' },
  {
    field: 'targetDate',
    phrases: ['due this week', 'due next week', 'this week', '本周到期', '下周到期'],
    window: 'next7',
  },
  {
    field: 'targetDate',
    phrases: ['due this month', 'due next month', 'this month', '本月到期', '下月到期'],
    window: 'next30',
  },
  {
    field: 'targetDate',
    phrases: ['due this quarter', 'this quarter', '本季度到期'],
    window: 'next90',
  },
  {
    field: 'targetDate',
    phrases: ['no target date', 'without target date', '无目标日期'],
    window: 'unset',
  },
  {
    field: 'startDate',
    phrases: ['no start date', 'without start date', '无开始日期'],
    window: 'unset',
  },
  { field: 'startDate', phrases: ['already started', '已开始', '已启动'], window: 'past' },
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
];

const MY_LEAD_PHRASES = [
  'assigned to me',
  'led by me',
  'lead by me',
  'my projects',
  'mine',
  '我负责',
  '我的项目',
];
const NO_LEAD_PHRASES = ['no lead', 'unassigned', 'without lead', '无负责人', '没有负责人'];
const MY_CREATOR_PHRASES = ['created by me', 'i created', '我创建的', '由我创建'];

const mergeValues = <T>(a: readonly T[], b: readonly T[]): T[] => [...new Set([...a, ...b])];

const mergeFilter = (
  filters: ProjectListFilter[],
  next: ProjectListFilter,
): ProjectListFilter[] => {
  const key = projectListFilterKey(next);
  const existing = filters.find((filter) => projectListFilterKey(filter) === key);
  // Same field → union the value sets ("active paused" = status:{active,paused}).
  if (existing && 'values' in existing && 'values' in next) {
    const merged = {
      ...existing,
      values: mergeValues(existing.values, next.values),
    } as ProjectListFilter;
    return filters.map((filter) => (projectListFilterKey(filter) === key ? merged : filter));
  }
  return upsertProjectListFilter(filters, next);
};

/**
 * Parse a natural-language filter description into list filters. Returns an
 * empty array when nothing recognizable was said — the UI surfaces that as
 * an inline no-match state, never a silently wrong filter.
 */
export const parseAiProjectFilters = (
  text: string,
  context: AiProjectFilterContext = {},
): ProjectListFilter[] => {
  const normalized = text.trim().toLocaleLowerCase();
  if (!normalized) return [];

  let filters: ProjectListFilter[] = [];
  const statuses: ProjectStatus[] = [];
  const priorities: number[] = [];
  const healthValues: (ProjectHealth | null)[] = [];

  for (const [status, phrases] of STATUS_PHRASES) {
    if (phrases.some((phrase) => containsPhrase(normalized, phrase))) statuses.push(status);
  }
  if (statuses.length > 0) filters.push({ type: 'status', values: statuses });

  for (const [priority, phrases] of PRIORITY_PHRASES) {
    if (phrases.some((phrase) => containsPhrase(normalized, phrase))) priorities.push(priority);
  }
  if (priorities.length > 0) filters.push({ type: 'priority', values: priorities });

  for (const [health, phrases] of HEALTH_PHRASES) {
    if (phrases.some((phrase) => containsPhrase(normalized, phrase))) healthValues.push(health);
  }
  if (healthValues.length > 0) filters.push({ type: 'health', values: healthValues });

  for (const { field, phrases, window } of DATE_PHRASES) {
    if (phrases.some((phrase) => containsPhrase(normalized, phrase))) {
      filters = mergeFilter(filters, { field, type: 'date', window });
    }
  }

  // People: explicit creator/lead context first, then "me", then a bare
  // member name defaults to lead (the projects list's most likely intent).
  if (NO_LEAD_PHRASES.some((phrase) => containsPhrase(normalized, phrase))) {
    filters = mergeFilter(filters, { type: 'lead', values: [null] });
  }
  if (
    context.currentUserId &&
    MY_LEAD_PHRASES.some((phrase) => containsPhrase(normalized, phrase))
  ) {
    filters = mergeFilter(filters, { type: 'lead', values: [context.currentUserId] });
  }
  if (
    context.currentUserId &&
    MY_CREATOR_PHRASES.some((phrase) => containsPhrase(normalized, phrase))
  ) {
    filters = mergeFilter(filters, { type: 'creator', values: [context.currentUserId] });
  }

  const members = [...(context.members ?? [])].sort((a, b) => b.name.length - a.name.length);
  for (const member of members) {
    const name = member.name.trim().toLocaleLowerCase();
    if (name.length < 2 || !containsPhrase(normalized, name)) continue;
    if (context.currentUserId && member.userId === context.currentUserId) {
      const alreadyLead = filters.some(
        (filter) =>
          projectListFilterKey(filter) === 'lead' &&
          'values' in filter &&
          filter.values.includes(member.userId),
      );
      if (alreadyLead) continue;
    }
    const creatorContext =
      containsPhrase(normalized, `created by ${name}`) ||
      containsPhrase(normalized, `由${name}创建`) ||
      containsPhrase(normalized, `${name}创建`);
    // Bare member names and explicit lead context both land on the lead
    // filter — the projects list's most likely intent.
    if (creatorContext) {
      filters = mergeFilter(filters, { type: 'creator', values: [member.userId] });
    } else {
      filters = mergeFilter(filters, { type: 'lead', values: [member.userId] });
    }
  }

  return filters;
};
