import type { WorkQueryEntityType } from '@orvilo/types';

import { workAttentionService } from '@/services/workAttention';

/** Hard ceiling so a huge view cannot turn a menu click into a runaway export. */
export const SAVED_VIEW_CSV_MAX_ROWS = 5000;

const PAGE_SIZE = 100;

export interface SavedViewCsvRow {
  createdAt?: Date | string | null;
  id: string;
  identifier?: string | null;
  name?: string | null;
  priority?: number | null;
  status?: string | null;
  updatedAt?: Date | string | null;
}

const csvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  // Quote always — commas/quotes/newlines in titles then never break columns.
  return `"${text.replaceAll('"', '""')}"`;
};

const toIso = (value: Date | string | null | undefined): string => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const TASK_HEADERS = [
  'ID',
  'Identifier',
  'Title',
  'Status',
  'Priority',
  'Created',
  'Updated',
] as const;
const PROJECT_HEADERS = ['ID', 'Identifier', 'Name', 'Status', 'Created', 'Updated'] as const;

export interface SavedViewCsvFormatters {
  /** Maps the numeric task priority to a display label; raw value when absent. */
  priority?: (value: number | null | undefined) => string | number;
  /** Maps the status key to a display label; raw key when absent. */
  status?: (value: string | null | undefined) => string;
}

/**
 * Builds the CSV body for a view's evaluated rows. Task and project rows share
 * the identifier/status/date columns; only the title column wording differs.
 */
export const buildSavedViewCsv = (
  entityType: WorkQueryEntityType,
  rows: readonly SavedViewCsvRow[],
  formatters: SavedViewCsvFormatters = {},
): string => {
  const status = formatters.status ?? ((value: string | null | undefined) => value ?? '');
  const lines: string[] = [];
  if (entityType === 'project') {
    lines.push(PROJECT_HEADERS.map(csvCell).join(','));
    for (const row of rows) {
      lines.push(
        [
          row.id,
          row.identifier,
          row.name,
          status(row.status),
          toIso(row.createdAt),
          toIso(row.updatedAt),
        ]
          .map(csvCell)
          .join(','),
      );
    }
    return lines.join('\n');
  }
  lines.push(TASK_HEADERS.map(csvCell).join(','));
  const priority = formatters.priority ?? ((value: number | null | undefined) => value ?? '');
  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.identifier,
        row.name,
        status(row.status),
        priority(row.priority),
        toIso(row.createdAt),
        toIso(row.updatedAt),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n');
};

interface EvaluatePage {
  groups?: { hasMore: boolean; key: string; tasks: SavedViewCsvRow[] }[];
  needsRepair?: boolean;
  projectGroups?: { hasMore: boolean; key: string; projects: SavedViewCsvRow[] }[];
  projects?: SavedViewCsvRow[];
  queryHash: string;
  tasks?: SavedViewCsvRow[];
  total: number;
}

/**
 * Pulls every page of a view's evaluation — grouped queries paginate per
 * group (`afterId` + `groupKey`), flat queries by `afterId` alone. Rows are
 * deduped by id; the hard cap stops pathological exports.
 */
export const fetchAllSavedViewRows = async (viewId: string): Promise<SavedViewCsvRow[]> => {
  const collected = new Map<string, SavedViewCsvRow>();
  const push = (items: readonly SavedViewCsvRow[] | undefined) => {
    for (const item of items ?? []) collected.set(item.id, item);
  };

  const first = await workAttentionService.savedViewEvaluate({ id: viewId, limit: PAGE_SIZE });
  const evaluation = first.data.evaluation as EvaluatePage;
  if (evaluation.needsRepair) throw new Error('view definition needs repair');
  const queryHash = evaluation.queryHash;
  push(evaluation.tasks);
  push(evaluation.projects);

  const taskGroups = evaluation.groups ?? [];
  const projectGroups = evaluation.projectGroups ?? [];

  if (taskGroups.length > 0 || projectGroups.length > 0) {
    // Each group has its own cursor — drain them independently.
    const groups = [
      ...taskGroups.map((group) => ({
        hasMore: group.hasMore,
        items: group.tasks,
        key: group.key,
      })),
      ...projectGroups.map((group) => ({
        hasMore: group.hasMore,
        items: group.projects,
        key: group.key,
      })),
    ];
    for (const group of groups) {
      // Don't rely on the flat `tasks`/`projects` union also being present —
      // grouped responses may carry items only inside their bucket.
      push(group.items);
      let hasMore = group.hasMore;
      let afterId = group.items.at(-1)?.id;
      while (hasMore && afterId && collected.size < SAVED_VIEW_CSV_MAX_ROWS) {
        const next = await workAttentionService.savedViewEvaluate({
          afterId,
          groupKey: group.key,
          id: viewId,
          limit: PAGE_SIZE,
          queryHash,
        });
        const nextEval = next.data.evaluation as EvaluatePage;
        const nextGroup = [...(nextEval.groups ?? []), ...(nextEval.projectGroups ?? [])].find(
          (entry) => entry.key === group.key,
        );
        const items =
          (nextGroup ? ('tasks' in nextGroup ? nextGroup.tasks : nextGroup.projects) : []) ?? [];
        const before = collected.size;
        push(items);
        // Empty page or all-duplicate page means the cursor stopped making
        // progress — bail rather than spin on a misbehaving backend.
        if (items.length === 0 || collected.size === before) break;
        afterId = items.at(-1)?.id;
        hasMore = nextGroup?.hasMore === true;
      }
    }
  } else {
    let afterId = (evaluation.tasks ?? evaluation.projects ?? []).at(-1)?.id ?? undefined;
    while (
      collected.size < (evaluation.total ?? 0) &&
      collected.size < SAVED_VIEW_CSV_MAX_ROWS &&
      afterId
    ) {
      const next = await workAttentionService.savedViewEvaluate({
        afterId,
        id: viewId,
        limit: PAGE_SIZE,
        queryHash,
      });
      const nextEval = next.data.evaluation as EvaluatePage;
      const items = nextEval.tasks ?? nextEval.projects ?? [];
      const before = collected.size;
      push(items);
      if (items.length === 0 || collected.size === before) break;
      afterId = items.at(-1)?.id;
    }
  }

  return [...collected.values()];
};
