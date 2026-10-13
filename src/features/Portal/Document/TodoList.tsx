'use client';

import { AGENT_PLAN_FILE_TYPE } from '@orvilo/const';
import { cn } from 'cn';
import { ChevronDown, ChevronUp, ListTodo } from 'lucide-react';
import { createElement, memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';
import { useNotebookStore } from '@/store/notebook';
import { notebookSelectors } from '@/store/notebook/selectors';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

interface TodoItem {
  completed: boolean;
  text: string;
}

interface TodoState {
  items: TodoItem[];
  updatedAt: string;
}

const styles = {
  // Merged after listContainer: py-0 removes its py-1 without priority CSS.
  collapsed: 'max-h-0 overflow-y-hidden py-0 opacity-0',
  container:
    'cursor-pointer select-none rounded-(--radius-card) border border-divider bg-popover p-4 transition-[color,background-color,border-color,box-shadow] duration-(--orvilo-motion-mid) ease-(--ant-motion-ease-in-out) hover:bg-accent motion-reduce:transition-none',
  count: 'font-mono text-xs leading-5 text-muted-foreground',
  expanded: 'max-h-75 overflow-y-auto opacity-100',
  header: 'truncate text-sm leading-5.5 font-medium text-foreground',
  itemRow:
    'border-be border-dashed border-divider px-1 py-1.5 text-sm leading-5.5 last:border-be-0',
  listContainer:
    'mbs-2 flex flex-col overflow-x-hidden border-bs border-divider py-1 transition-[max-height,opacity,padding-block-start,padding-block-end] duration-(--orvilo-motion-mid) ease-(--ant-motion-ease-in-out) motion-reduce:transition-none',
  progress: 'h-1 flex-1 rounded-full bg-selected',
  progressFill:
    'h-full rounded-full bg-success transition-[width] duration-(--orvilo-motion-mid) ease-(--ant-motion-ease-in-out) motion-reduce:transition-none',
  root: 'shrink-0 px-4 pbe-4',
  textChecked: 'text-foreground-quaternary line-through',
} as const;

const TodoList = memo(() => {
  const { t } = useTranslation('portal');
  const [expanded, setExpanded] = useState(false);

  const [topicId, documentId] = useChatStore((s) => [
    s.activeTopicId,
    chatPortalSelectors.portalDocumentId(s),
  ]);

  const document = useNotebookStore(notebookSelectors.getDocumentById(topicId, documentId));

  // Only show for agent/plan documents with todos in metadata
  if (!document || document.fileType !== AGENT_PLAN_FILE_TYPE) return null;

  const todos: TodoState | undefined = document.metadata?.todos;
  const items = todos?.items || [];

  if (items.length === 0) return null;

  const total = items.length;
  const completed = items.filter((item) => item.completed).length;
  const progressPercent = total > 0 ? (completed / total) * 100 : 0;

  // Find current pending task (first incomplete item)
  const currentPendingTask = items.find((item) => !item.completed);

  const toggleExpanded = () => setExpanded(!expanded);

  return (
    <div className={styles.root}>
      <div className={styles.container} onClick={toggleExpanded}>
        {/* Header */}
        <div
          {...clickableProps()}
          className={cn(
            'flex min-h-8 flex-row items-center gap-2 justify-between',
            CLICKABLE_FOCUS_RING,
          )}
        >
          <div className="flex flex-row flex-1 min-w-0 items-center gap-2">
            <span className="anticon shrink-0 text-muted-foreground" role="img">
              <ListTodo fill={'transparent'} height={16} size={16} width={16} />
            </span>
            <span className={styles.header}>
              {currentPendingTask?.text || t('document.todos.allCompleted')}
            </span>
            <Badge className="shrink-0" size="sm" variant="secondary">
              <span className={styles.count}>
                {completed}/{total}
              </span>
            </Badge>
          </div>
          <span className="anticon shrink-0 text-foreground-tertiary" role="img">
            {createElement(expanded ? ChevronUp : ChevronDown, {
              size: 16,
              width: 16,
              height: 16,
              fill: 'transparent',
            })}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="flex flex-row gap-2 mbs-2">
          <div className={styles.progress}>
            <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        {/* Expandable Todo List */}
        <div className={cn(styles.listContainer, expanded ? styles.expanded : styles.collapsed)}>
          {items.map((item, index) => (
            <div className={cn('flex items-center gap-2', styles.itemRow)} key={index}>
              <Checkbox
                checked={item.completed}
                className="cursor-default pointer-events-none rounded-full data-checked:border-success data-checked:text-success-on-fill"
                style={{
                  backgroundColor: item.completed ? 'var(--success)' : undefined,
                }}
              />
              <div
                className={
                  item.completed ? cn('text-muted-foreground', styles.textChecked) : undefined
                }
              >
                {item.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

TodoList.displayName = 'TodoList';

export default TodoList;
