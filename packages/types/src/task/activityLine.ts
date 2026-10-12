/**
 * What an Issue activity row may say where an agent reads it: agent prompts
 * and the CLI's task view. One rule, shared, so no surface prints more than
 * another.
 */

const TASK_STATUSES = new Set([
  'backlog',
  'canceled',
  'completed',
  'failed',
  'paused',
  'running',
  'scheduled',
]);

const WORKFLOW_CATEGORIES = new Set([
  'backlog',
  'canceled',
  'done',
  'in_progress',
  'in_review',
  'todo',
  'triage',
]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Five or six cron fields made only of the characters cron syntax uses. */
const CRON_PATTERN = /^[\d*,/?LW#-]+(?: [\d*,/?LW#-]+){4,5}$/;
/** The shape of an IANA zone name such as `Asia/Shanghai` or `UTC`. */
const TIMEZONE_SHAPE = /^[A-Z][\w+-]*(?:\/[A-Z][\w+-]*){0,2}$/i;
/** A real zone the runtime knows — the shape alone would admit words joined by slashes. */
const isTimezone = (value: string): boolean => {
  if (!TIMEZONE_SHAPE.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const PRIORITY_LABELS: Record<number, string> = {
  0: 'none',
  1: 'urgent',
  2: 'high',
  3: 'normal',
  4: 'low',
};

/**
 * Each reader below returns the exact text to print for one stored value, or
 * `undefined` when the value is not what the field promises. The text
 * returned is always either a literal from this file or the very string that
 * was matched in full — never a second reading of the value.
 */
type ValueReader = (value: unknown) => string | undefined;

const isAbsent = (value: unknown): boolean => value === null || value === undefined;

const fromVocabulary =
  (vocabulary: ReadonlySet<string>): ValueReader =>
  (value) =>
    isAbsent(value)
      ? 'none'
      : typeof value === 'string' && vocabulary.has(value)
        ? value
        : undefined;

const readStatus = fromVocabulary(TASK_STATUSES);
const readWorkflowCategory = fromVocabulary(WORKFLOW_CATEGORIES);

const readPriority: ValueReader = (value) =>
  isAbsent(value)
    ? 'none'
    : typeof value === 'number' && Object.hasOwn(PRIORITY_LABELS, value)
      ? PRIORITY_LABELS[value]
      : undefined;

const readDate: ValueReader = (value) =>
  isAbsent(value) ? 'none' : typeof value === 'string' && ISO_DATE.test(value) ? value : undefined;

/** A workflow position is `{ category }`; a team's own state name is typed text and is not read. */
const readWorkflow: ValueReader = (value) => {
  if (isAbsent(value)) return 'none';
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  const { category } = value as Record<string, unknown>;
  return typeof category === 'string' ? readWorkflowCategory(category) : undefined;
};

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/**
 * An automation setting, rebuilt from checked parts. The cron pattern and
 * the timezone are strings a user typed, so each must have the shape of what
 * it claims to be, in full.
 */
const readAutomation: ValueReader = (value) => {
  if (isAbsent(value)) return 'off';
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  if (v.mode === 'heartbeat') {
    return isCount(v.heartbeatInterval) ? `heartbeat(${v.heartbeatInterval}s)` : undefined;
  }
  if (v.mode !== 'schedule') return undefined;

  // Every part a user can edit shows, or a timezone-only or cap-only change
  // reads as "from X to X".
  const { maxExecutions: max, schedulePattern: pattern, scheduleTimezone: timezone } = v;
  if (typeof pattern !== 'string' || pattern.length > 100 || !CRON_PATTERN.test(pattern)) {
    return undefined;
  }
  const parts = [pattern];
  if (!isAbsent(timezone)) {
    if (typeof timezone !== 'string' || timezone.length > 64 || !isTimezone(timezone)) {
      return undefined;
    }
    parts.push(timezone);
  }
  if (!isAbsent(max)) {
    if (!isCount(max)) return undefined;
    parts.push(`max ${max}`);
  }
  return `schedule(${parts.join(', ')})`;
};

/**
 * The only activity fields a prompt renders, each with the label it prints
 * and the reader that checks both of its sides. Own properties only: a field
 * that is not listed here, including any added later, contributes nothing.
 */
const PROMPT_PROPERTY_FIELDS: Record<string, { label: string; read: ValueReader }> = {
  automation: { label: 'automation', read: readAutomation },
  dueDate: { label: 'due date', read: readDate },
  priority: { label: 'priority', read: readPriority },
  status: { label: 'status', read: readStatus },
  workflow: { label: 'workflow', read: readWorkflow },
};

/**
 * What one activity-feed property change contributes to an agent prompt: a
 * line fragment, or `null` for nothing. The single rule for every prompt
 * surface — both task formatters call this and neither reads the row itself.
 *
 * An activity row is stored JSON, and much of it is text somebody typed,
 * often on another Issue. A prompt cannot mark such text as quoted, so the
 * input is treated as untyped and none of that text is rendered:
 *
 * - Only the fields in {@link PROMPT_PROPERTY_FIELDS} produce a line. A
 *   rename, a label, a link, a project / milestone / team move or a relation
 *   produces nothing; what they changed is already in the detail's own
 *   fields.
 * - A listed field prints only values matched in full against a closed
 *   vocabulary or a strict shape. If either side fails its check the row
 *   contributes nothing at all, rather than a partial or placeholder line.
 */
export const formatPropertyChange = (change: unknown): string | null => {
  if (typeof change !== 'object' || change === null || Array.isArray(change)) return null;
  const { field, from, to } = change as Record<string, unknown>;
  if (typeof field !== 'string' || !Object.hasOwn(PROMPT_PROPERTY_FIELDS, field)) return null;
  const { label, read } = PROMPT_PROPERTY_FIELDS[field];
  const before = read(from);
  const after = read(to);
  return before === undefined || after === undefined ? null : `${label}: ${before} → ${after}`;
};
