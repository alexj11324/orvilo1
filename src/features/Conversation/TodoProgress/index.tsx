'use client';
import { type StepContextTodos } from '@orvilo/types';
import { cn } from 'cn';
import { Circle, CircleArrowRight, CircleCheck } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Plan,
  PlanAction,
  PlanContent,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from '@/components/ai-elements/plan';
import { TaskItem } from '@/components/ai-elements/task';
import { Badge } from '@/components/reui/badge';
import { Progress } from '@/components/ui/progress';
import { selectCurrentTurnTodosFromMessages } from '@/store/chat/slices/message/selectors/dbMessage';

import { dataSelectors, messageStateSelectors, useConversationStore } from '../store';

interface TodoProgressProps {
  className?: string;
  /**
   * When true, square the top corners — used when another panel (e.g.
   * QueueTray) sits flush above this one in the stack so the seams align.
   */
  topAttached?: boolean;
}

const TodoProgress = memo<TodoProgressProps>(({ className, topAttached }) => {
  const { t } = useTranslation('chat');
  const [expanded, setExpanded] = useState(false);

  // Get messages and AI generating state from conversation store
  const dbMessages = useConversationStore(dataSelectors.dbMessages);
  const isAIGenerating = useConversationStore(messageStateSelectors.isAIGenerating);

  // Extract todos produced within the current agent turn (after the last user
  // message). Older turns' todos intentionally drop out so a new operation
  // doesn't keep a stale completed progress bar on screen.
  const todos: StepContextTodos | undefined = useMemo(
    () => selectCurrentTurnTodosFromMessages(dbMessages),
    [dbMessages],
  );

  // Calculate progress
  const items = todos?.items || [];
  const total = items.length;
  const completed = items.filter((item) => item.status === 'completed').length;

  // Find current pending task (first non-completed item, prioritize processing)
  const currentPendingTask =
    items.find((item) => item.status === 'processing') ||
    items.find((item) => item.status === 'todo');

  // Don't render if no todos
  if (total === 0) return null;

  return (
    <Plan
      className={cn('rounded-b-none', topAttached && 'rounded-t-none', className)}
      isStreaming={isAIGenerating}
      open={expanded}
      onOpenChange={setExpanded}
    >
      <PlanHeader>
        <div className="min-w-0 flex-1 space-y-2">
          <PlanTitle className="truncate">
            {currentPendingTask?.text || t('todoProgress.allCompleted')}
          </PlanTitle>
          <Progress aria-label={t('todoProgress.title')} value={(completed / total) * 100} />
        </div>
        <Badge className="shrink-0" size="sm">
          {completed}/{total}
        </Badge>
        <PlanAction>
          <PlanTrigger />
        </PlanAction>
      </PlanHeader>
      <PlanContent className="max-h-72 space-y-2 overflow-auto overscroll-contain">
        {items.map((item, index) => {
          const completed = item.status === 'completed';
          const StatusIcon = completed
            ? CircleCheck
            : item.status === 'processing'
              ? CircleArrowRight
              : Circle;
          return (
            <TaskItem className="flex items-start gap-2" key={index}>
              <StatusIcon
                aria-hidden
                className={cn('mt-0.5 size-4 shrink-0', completed && 'text-success')}
              />
              <span
                className={cn(
                  completed && 'line-through',
                  item.status === 'processing' && 'text-foreground',
                )}
              >
                {item.text}
              </span>
            </TaskItem>
          );
        })}
      </PlanContent>
    </Plan>
  );
});
TodoProgress.displayName = 'TodoProgress';
export default TodoProgress;
