import { describe, expect, it } from 'vitest';

import enChat from '../../../../locales/en-US/chat.json';
import zhChat from '../../../../locales/zh-CN/chat.json';
import {
  COLUMN_I18N_KEYS,
  COLUMN_STATUS_VISUAL,
  STATUS_KANBAN_COLUMNS,
} from '../AgentTaskList/kanbanBoardModel';
import { resolveTaskStatusRow, WORKFLOW_STATUS_CHOICES } from './taskStatusRow';

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

  it('offers the kanban board’s status columns, in board order and with triage', () => {
    // The Status menu is the board: every column's drop target becomes an
    // option in the same order, the triage intake column first. A hardcoded
    // list dropped triage and let the labels drift from the headers.
    expect(WORKFLOW_STATUS_CHOICES.map((choice) => choice.category)).toEqual(
      STATUS_KANBAN_COLUMNS.map((column) => column.targetWorkflowCategory),
    );
    expect(WORKFLOW_STATUS_CHOICES.map((choice) => choice.columnKey)).toEqual(
      STATUS_KANBAN_COLUMNS.map((column) => column.key),
    );
    expect(WORKFLOW_STATUS_CHOICES[0]?.category).toBe('triage');
  });

  it('reads every option’s icon and label from the board’s own column maps', () => {
    for (const choice of WORKFLOW_STATUS_CHOICES) {
      const i18nKey = COLUMN_I18N_KEYS[choice.columnKey];
      // The maps the column headers read must resolve for the picker's
      // column too, in both shipped locales — never a raw key or iconless row.
      expect(i18nKey, choice.columnKey).toBeTruthy();
      expect(COLUMN_STATUS_VISUAL[choice.columnKey], choice.columnKey).toBeTruthy();
      expect((enChat as Record<string, string>)[i18nKey], i18nKey).toBeTruthy();
      expect((zhChat as Record<string, string>)[i18nKey], i18nKey).toBeTruthy();
    }
  });

  it('names every Status choice distinctly in zh-CN', () => {
    // Backlog and Todo both read "待办" once — options must stay unique.
    const labels = WORKFLOW_STATUS_CHOICES.map(
      (choice) => (zhChat as Record<string, string>)[COLUMN_I18N_KEYS[choice.columnKey]],
    );
    expect(new Set(labels).size).toBe(labels.length);
  });
});
