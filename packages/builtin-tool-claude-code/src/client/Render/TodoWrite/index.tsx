'use client';

import { TodoPanelHeader } from '@orvilo/shared-tool-ui/components';
import type { BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
import { CircleArrowRight } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Checkbox } from '@/components/ui/checkbox';

import type { ClaudeCodeTodoItem, TodoWriteArgs } from '../../../types';
import { computeTodoSummary, TODO_SUMMARY_LABEL_KEYS } from '../../todoSummary';

const styles = {
  itemRow:
    'min-h-11 w-full border-be border-dashed border-divider px-3 py-2.5 text-sm leading-5.5 last:border-be-0',
  processingRow: 'flex items-center gap-2',
  textCompleted: 'text-muted-foreground line-through',
  textPending: 'text-muted-foreground',
  textProcessing: 'text-foreground',
};

interface TodoRowProps {
  item: ClaudeCodeTodoItem;
}

const TodoRow = memo<TodoRowProps>(({ item }) => {
  const { status, content, activeForm } = item;

  if (status === 'in_progress') {
    return (
      <div className={cn(styles.itemRow, styles.processingRow)}>
        <span className="anticon text-info-text" role="img">
          <CircleArrowRight fill={'transparent'} height={17} size={17} width={17} />
        </span>
        <span className={styles.textProcessing}>{activeForm || content}</span>
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
        {content}
      </span>
    </label>
  );
});

TodoRow.displayName = 'ClaudeCodeTodoRow';

const TodoWrite = memo<BuiltinRenderProps<TodoWriteArgs>>(({ args }) => {
  const { t } = useTranslation('plugin');
  const todos = args?.todos;

  const summary = useMemo(() => computeTodoSummary(args), [args]);

  if (!todos || todos.length === 0) return null;

  return (
    <div className="w-full rounded-(--radius-card) border bg-card text-sm leading-5.5">
      <TodoPanelHeader label={t(TODO_SUMMARY_LABEL_KEYS[summary.state])} summary={summary} />
      {todos.map((item, index) => (
        <TodoRow item={item} key={index} />
      ))}
    </div>
  );
});

TodoWrite.displayName = 'ClaudeCodeTodoWrite';

export default TodoWrite;
