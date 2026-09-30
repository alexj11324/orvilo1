'use client';

import { TodoPanelHeader } from '@orvilo/shared-tool-ui/components';
import type { BuiltinRenderProps } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { CircleArrowRight } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Checkbox } from '@/components/ui/checkbox';

import type { ClaudeCodeTodoItem, TodoWriteArgs } from '../../../types';
import { computeTodoSummary, TODO_SUMMARY_LABEL_KEYS } from '../../todoSummary';

const styles = createStaticStyles(({ css, cssVar }) => ({
  itemRow: css`
    width: 100%;
    padding-block: 10px;
    padding-inline: 12px;
    border-block-end: 1px dashed ${cssVar.colorBorderSecondary};

    &:last-child {
      border-block-end: none;
    }
  `,
  processingRow: css`
    display: flex;
    gap: 7px;
    align-items: center;
  `,
  textCompleted: css`
    color: ${cssVar.colorTextQuaternary};
    text-decoration: line-through;
  `,
  textPending: css`
    color: ${cssVar.colorTextSecondary};
  `,
  textProcessing: css`
    color: ${cssVar.colorText};
  `,
}));

interface TodoRowProps {
  item: ClaudeCodeTodoItem;
}

const TodoRow = memo<TodoRowProps>(({ item }) => {
  const { status, content, activeForm } = item;

  if (status === 'in_progress') {
    return (
      <div className={cx(styles.itemRow, styles.processingRow)}>
        <span className="anticon" role="img" style={{ color: cssVar.colorInfo }}>
          <CircleArrowRight fill={'transparent'} height={17} size={17} width={17} />
        </span>
        <span className={styles.textProcessing}>{activeForm || content}</span>
      </div>
    );
  }

  const isCompleted = status === 'completed';

  return (
    <label className={cx('flex items-center gap-2', styles.itemRow)} style={{ cursor: 'default' }}>
      <Checkbox
        checked={isCompleted}
        className="rounded-full data-checked:border-success data-checked:bg-success"
        style={{ borderWidth: 1.5 }}
      />
      <span
        className={cx(
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
    <div className="rounded-md border bg-card" style={{ width: '100%' }}>
      <TodoPanelHeader label={t(TODO_SUMMARY_LABEL_KEYS[summary.state])} summary={summary} />
      {todos.map((item, index) => (
        <TodoRow item={item} key={index} />
      ))}
    </div>
  );
});

TodoWrite.displayName = 'ClaudeCodeTodoWrite';

export default TodoWrite;
