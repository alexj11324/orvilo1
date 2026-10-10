'use client';
import { TodoPanelHeader } from '@orvilo/shared-tool-ui/components';
import type { BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
import { CircleArrowRight } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Checkbox } from '@/components/ui/checkbox';

import type { TodoItem, TodoList as TodoListType, TodoStatus } from '../../../types';
import {
  computeTodoSummary,
  normalizeTodoItems,
  TODO_SUMMARY_LABEL_KEYS,
} from '../../components/todoSummary';

export interface TodoListRenderState {
  todos?: TodoListType;
}

// Styles matching TodoItemRow in SortableTodoList
const styles = {
  itemRow: 'w-full border-b border-dashed border-sidebar-border px-3 py-2.5 last:border-b-0',
  processingRow: 'flex items-center gap-[7px]',
  textCompleted: 'text-(--ant-color-text-quaternary) line-through',
  textProcessing: 'text-foreground',
  textTodo: 'text-muted-foreground',
};

interface ReadOnlyTodoItemProps {
  status: TodoStatus;
  text: string;
}

/**
 * Read-only todo item row, matching the style of TodoItemRow in SortableTodoList
 */
const ReadOnlyTodoItem = memo<ReadOnlyTodoItemProps>(({ text, status }) => {
  const isCompleted = status === 'completed';
  const isProcessing = status === 'processing';

  // Processing state uses CircleArrowRight icon
  if (isProcessing) {
    return (
      <div className={cn(styles.itemRow, styles.processingRow)}>
        <CircleArrowRight size={17} style={{ color: 'var(--info)' }} />
        <span className={styles.textProcessing}>{text}</span>
      </div>
    );
  }

  // Todo and completed states use Checkbox
  return (
    <label className={cn('flex flex-row items-center gap-2', styles.itemRow)}>
      <Checkbox
        checked={isCompleted}
        className="rounded-full"
        style={{ borderWidth: 1.5, cursor: 'default', borderColor: 'var(--success)' }}
      />
      <span
        className={cn(styles.textTodo, isCompleted && styles.textCompleted)}
        style={{ color: isCompleted ? 'var(--muted-foreground)' : undefined }}
      >
        {text}
      </span>
    </label>
  );
});

ReadOnlyTodoItem.displayName = 'ReadOnlyTodoItem';

interface TodoListUIProps {
  items: TodoItem[];
}

/**
 * Read-only TodoList UI component, matching the Claude Code todo rendering:
 * a status header (current step + progress badge) above the item rows.
 */
const TodoListUI = memo<TodoListUIProps>(({ items }) => {
  const { t } = useTranslation('plugin');
  const summary = useMemo(() => computeTodoSummary(items), [items]);

  if (items.length === 0) {
    return null;
  }

  return (
    // Outer container with background - matches AddTodoIntervention
    <div
      style={{
        background: 'var(--card)',
        border: `1px solid var(--sidebar-border)`,
        borderRadius: 'var(--ant-border-radius)',
        width: '100%',
      }}
    >
      <TodoPanelHeader label={t(TODO_SUMMARY_LABEL_KEYS[summary.state])} summary={summary} />
      {items.map((item, index) => (
        <ReadOnlyTodoItem key={index} status={item.status} text={item.text} />
      ))}
    </div>
  );
});

TodoListUI.displayName = 'TodoListUI';

/**
 * TodoList Render component for the orvilo-agent tool
 * Read-only display of todo items matching the style of AddTodoIntervention
 */
const TodoListRender = memo<BuiltinRenderProps<unknown, TodoListRenderState>>(({ pluginState }) => {
  const items = normalizeTodoItems(pluginState?.todos);

  return <TodoListUI items={items} />;
});

TodoListRender.displayName = 'TodoListRender';

export default TodoListRender;
export { TodoListUI };
