'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
import { CircleArrowRight, CircleCheckBig, CircleX, ListTodo, RotateCcw } from 'lucide-react';
import { createElement, memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Checkbox } from '@/components/ui/checkbox';

import { ClaudeCodeApiName, type TaskUpdateArgs } from '../../../types';

const styles = {
  header:
    'flex items-center gap-2 border-be border-divider bg-fill-quaternary px-3 py-2.5 text-sm leading-5.5',
  headerCount:
    'shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-xs leading-5 text-muted-foreground',
  headerDetail: 'min-w-0 overflow-hidden text-foreground text-ellipsis',
  headerLabel: 'flex min-w-0 flex-1 items-center gap-0 truncate text-muted-foreground',
  itemRow:
    'min-h-11 w-full border-be border-dashed border-divider px-3 py-2.5 text-sm leading-5.5 last:border-be-0',
  processingRow: 'flex items-center gap-2',
  textCompleted: 'text-muted-foreground line-through',
  textPending: 'text-muted-foreground',
  textProcessing: 'text-foreground',
};

interface TaskPluginStateItem {
  id?: string;
  status: 'todo' | 'processing' | 'completed';
  text: string;
}

interface TaskPluginState {
  todos?: {
    items?: TaskPluginStateItem[];
    updatedAt?: string;
  };
}

interface TaskRowProps {
  item: TaskPluginStateItem;
}

const TaskRow = memo<TaskRowProps>(({ item }) => {
  const { status, text } = item;

  if (status === 'processing') {
    return (
      <div className={cn(styles.itemRow, styles.processingRow)}>
        <span className="anticon text-info-text" role="img">
          <CircleArrowRight fill={'transparent'} height={17} size={17} width={17} />
        </span>
        <span className={styles.textProcessing}>{text}</span>
      </div>
    );
  }

  const isCompleted = status === 'completed';

  return (
    <label className={cn('flex cursor-default items-center gap-2', styles.itemRow)}>
      <Checkbox
        checked={isCompleted}
        className="rounded-full data-checked:border-success data-checked:bg-success"
      />
      <span
        className={cn(
          styles.textPending,
          isCompleted && 'text-muted-foreground',
          isCompleted && styles.textCompleted,
        )}
      >
        {text}
      </span>
    </label>
  );
});

TaskRow.displayName = 'ClaudeCodeTaskRow';

/**
 * Per-call override that swaps the header into a status-flip readout
 * ("Completed: Read hosts") when the panel is rendered for a TaskUpdate.
 * Computed by the Task component from `apiName` + `args` so TaskHeader
 * stays a pure presentational component.
 *
 * `label` is the verb shown before `:`, `detail` is the subject; both
 * are pre-localized strings (no i18n inside TaskHeader for overrides).
 */
interface TaskHeaderOverride {
  color: string;
  detail?: string;
  icon: typeof CircleArrowRight;
  label: string;
}

interface TaskHeaderProps {
  completed: number;
  inProgress?: TaskPluginStateItem;
  override?: TaskHeaderOverride;
  total: number;
}

const TaskHeader = memo<TaskHeaderProps>(({ completed, total, inProgress, override }) => {
  const { t } = useTranslation('plugin');
  const allDone = total > 0 && completed === total;

  const icon =
    override?.icon ?? (inProgress ? CircleArrowRight : allDone ? CircleCheckBig : ListTodo);
  const color =
    override?.color ??
    (inProgress ? 'var(--info-text)' : allDone ? 'var(--success-text)' : 'var(--muted-foreground)');

  const label =
    override?.label ??
    (inProgress
      ? t('builtins.orvilo-claude-code.todoWrite.currentStep')
      : allDone
        ? t('builtins.orvilo-claude-code.todoWrite.allDone')
        : t('builtins.orvilo-claude-code.todoWrite.todos'));
  const detail = override ? override.detail : inProgress?.text;

  return (
    <div className={styles.header}>
      <span className="anticon shrink-0" role="img" style={{ color }}>
        {createElement(icon, { size: 16, width: 16, height: 16, fill: 'transparent' })}
      </span>
      <div className={styles.headerLabel}>
        <span>{label}</span>
        {detail && (
          <>
            <span>: </span>
            <span className={styles.headerDetail}>{detail}</span>
          </>
        )}
      </div>
      <span className={styles.headerCount}>
        {completed}/{total}
      </span>
    </div>
  );
});

TaskHeader.displayName = 'ClaudeCodeTaskHeader';

/**
 * Panel render for CC 2.1.143+ task tools (TaskCreate / TaskUpdate / TaskList).
 *
 * Reads the **adapter-synthesized** `pluginState.todos.items` snapshot — the
 * same source consumed by `selectTodosFromMessages`. Each per-call args
 * carries only a delta, so the panel can't be built from args alone; the
 * accumulator's snapshot is the source of truth.
 *
 * Returns `null` when the snapshot is absent or empty (typical for a fresh
 * TaskList before any creates, or a TaskUpdate that failed).
 *
 * Header behaviour:
 *  - Default (TaskCreate / TaskList / TaskUpdate without status): shows the
 *    standard `currentStep / allDone / todos` aggregate label so the panel
 *    stays visually consistent with legacy TodoWrite sessions.
 *  - TaskUpdate with `args.status`: the per-call signal IS that status flip,
 *    so the header mirrors the chip ("Completed: Read hosts") instead of
 *    burying it under the aggregate. Subject is resolved from pluginState
 *    by id; `args.subject` is the resume-gap fallback.
 */
const Task = memo<BuiltinRenderProps<TaskUpdateArgs | undefined, TaskPluginState>>(
  ({ apiName, args, pluginState }) => {
    const items = pluginState?.todos?.items;
    const { t } = useTranslation('plugin');

    const stats = useMemo(() => {
      const list = items ?? [];
      return {
        completed: list.filter((item) => item.status === 'completed').length,
        inProgress: list.find((item) => item.status === 'processing'),
        total: list.length,
      };
    }, [items]);

    const override = useMemo<TaskHeaderOverride | undefined>(() => {
      if (apiName !== ClaudeCodeApiName.TaskUpdate) return undefined;
      const status = args?.status;
      const taskId = args?.taskId;
      const argsSubject = args?.subject;
      const resolvedSubject =
        argsSubject ?? (taskId ? items?.find((item) => item.id === taskId)?.text : undefined);
      if (status) {
        const map = {
          completed: {
            color: 'var(--success-text)',
            icon: CircleCheckBig,
            label: t('builtins.orvilo-claude-code.task.updateCompleted'),
          },
          deleted: {
            color: 'var(--destructive-text)',
            icon: CircleX,
            label: t('builtins.orvilo-claude-code.task.updateDeleted'),
          },
          in_progress: {
            color: 'var(--info-text)',
            icon: CircleArrowRight,
            label: t('builtins.orvilo-claude-code.task.updateInProgress'),
          },
          pending: {
            color: 'var(--muted-foreground)',
            icon: RotateCcw,
            label: t('builtins.orvilo-claude-code.task.updatePending'),
          },
        } as const;
        const entry = map[status];
        return { ...entry, detail: resolvedSubject };
      }
      // Subject-only edit: surface the new subject as the header detail so a
      // collapsed panel still reads "Task updated: <subject>" instead of the
      // generic todo aggregate.
      if (argsSubject) {
        return {
          color: 'var(--muted-foreground)',
          detail: resolvedSubject,
          icon: ListTodo,
          label: t('builtins.orvilo-claude-code.task.updateSubject.completed'),
        };
      }
      return undefined;
    }, [apiName, args, items, t]);

    if (!items || items.length === 0) return null;

    return (
      <div className="w-full rounded-(--radius-card) border bg-card">
        <TaskHeader
          completed={stats.completed}
          inProgress={stats.inProgress}
          override={override}
          total={stats.total}
        />
        {items.map((item, index) => (
          <TaskRow item={item} key={index} />
        ))}
      </div>
    );
  },
);

Task.displayName = 'ClaudeCodeTask';

export default Task;
