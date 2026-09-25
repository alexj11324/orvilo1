import { describe, expect, it } from 'vitest';

import zhChat from '../../../../locales/zh-CN/chat.json';
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

  it('offers the board’s workflow columns, without triage', () => {
    expect(WORKFLOW_STATUS_CHOICES).toEqual([
      'backlog',
      'todo',
      'in_progress',
      'in_review',
      'done',
      'canceled',
    ]);
  });

  it('names every Status choice distinctly in zh-CN', () => {
    // Backlog and Todo both read "待办", so the picker offered two identical rows.
    const labels = WORKFLOW_STATUS_CHOICES.map(
      (choice) => (zhChat as Record<string, string>)[`taskDetail.workflow.category.${choice}`],
    );
    expect(new Set(labels).size).toBe(labels.length);
  });
});
