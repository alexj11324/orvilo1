import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';

import type { CommandMenuSearchResult, CommandMenuWorkResult } from '../types';

/**
 * Result-action submenu pages, pushed onto the palette's page stack from a
 * task/project result row (trailing ⋯ affordance, or → on the highlighted
 * row). `result-actions` lists the actions; the other two are drill-downs.
 */
export const RESULT_ACTIONS_PAGE = 'result-actions';
export const RESULT_STATUS_PAGE = 'result-actions-status';
export const RESULT_PRIORITY_PAGE = 'result-actions-priority';

export const isResultActionsPage = (page: string | undefined): boolean =>
  page === RESULT_ACTIONS_PAGE || page === RESULT_STATUS_PAGE || page === RESULT_PRIORITY_PAGE;

/** Result types that expose Linear-style row actions (mutations exist for both). */
export const isActionableResultType = (type: string): type is 'project' | 'task' =>
  type === 'task' || type === 'project';

export const isActionableResult = (
  result: CommandMenuSearchResult,
): result is CommandMenuWorkResult => isActionableResultType(result.type);

/**
 * cmdk stamps each item's resolved value on `data-value`. Result rows use
 * `search-result <type> <id> <meta…>` (see SearchResults#getItemValue) — the
 * first two tokens after the prefix identify the row the actions apply to.
 */
const SEARCH_RESULT_VALUE_RE = /^search-result (\S+) (\S+)/;

export const findActionableResult = (
  results: CommandMenuSearchResult[],
  itemValue: null | string | undefined,
): CommandMenuWorkResult | undefined => {
  const match = itemValue ? SEARCH_RESULT_VALUE_RE.exec(itemValue) : null;
  if (!match) return undefined;
  const type = match[1];
  const id = match[2];
  if (!isActionableResultType(type)) return undefined;
  return results.find(
    (result): result is CommandMenuWorkResult => result.type === type && result.id === id,
  );
};

/** Detail route for the "Open" / "Copy link" actions; undefined for other types. */
export const resultDetailPath = (result: CommandMenuWorkResult): string | undefined => {
  switch (result.type) {
    case 'task': {
      return taskDetailPath(result.id, undefined, result.title);
    }
    case 'project': {
      return `/project/${result.id}`;
    }
    default: {
      return undefined;
    }
  }
};
