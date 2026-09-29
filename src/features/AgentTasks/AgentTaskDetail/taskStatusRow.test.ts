import { describe, expect, it } from 'vitest';

import enChat from '../../../../locales/en-US/chat.json';
import zhChat from '../../../../locales/zh-CN/chat.json';
import {
  COLUMN_I18N_KEYS,
  COLUMN_STATUS_VISUAL,
  STATUS_KANBAN_COLUMNS,
} from '../AgentTaskList/kanbanBoardModel';
import { resolveTaskStatusRow } from './taskStatusRow';

describe('resolveTaskStatusRow', () => {
  it('shows the workflow state — Linear’s one Status — when the issue has one', () => {
    // VYG-2: execution `running` and workflow `in_progress` both read "进行中";
    // the rail drew both rows. Only the workflow state is the Status.
    expect(resolveTaskStatusRow('running', 'in_progress', 'wf_1')).toEqual({
      category: 'in_progress',
      kind: 'workflow',
    });
    // Diverging states must not surface as two rows either.
    expect(resolveTaskStatusRow('backlog', 'in_progress', 'wf_1')).toEqual({
      category: 'in_progress',
      kind: 'workflow',
    });
  });

  it('falls back to the execution status for a task outside any workflow', () => {
    expect(resolveTaskStatusRow('paused', undefined, null)).toEqual({
      kind: 'execution',
      status: 'paused',
    });
    expect(resolveTaskStatusRow(undefined, undefined, null)).toEqual({
      kind: 'execution',
      status: 'backlog',
    });
  });

  it('reads every board column’s icon and label from its own maps, triage first', () => {
    // The Status menu is the board: the same column maps the headers read
    // must resolve for every picker row, in both shipped locales — never a
    // raw key or iconless row, and never the old hardcoded list.
    expect(STATUS_KANBAN_COLUMNS[0]?.key).toBe('triage');
    for (const column of STATUS_KANBAN_COLUMNS) {
      const i18nKey = COLUMN_I18N_KEYS[column.key];
      expect(i18nKey, column.key).toBeTruthy();
      expect(COLUMN_STATUS_VISUAL[column.key], column.key).toBeTruthy();
      expect((enChat as Record<string, string>)[i18nKey], i18nKey).toBeTruthy();
      expect((zhChat as Record<string, string>)[i18nKey], i18nKey).toBeTruthy();
    }
  });

  it('names every board column distinctly in zh-CN', () => {
    // The picker rows read the board's own column labels (triage included) —
    // a dup would render two identical rows.
    const labels = STATUS_KANBAN_COLUMNS.map(
      (column) => (zhChat as Record<string, string>)[COLUMN_I18N_KEYS[column.key]],
    );
    expect(labels.every((label) => typeof label === 'string' && label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
