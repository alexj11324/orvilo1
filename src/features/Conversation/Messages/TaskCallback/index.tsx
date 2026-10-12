'use client';
import { Markdown } from '@lobehub/ui';
import isEqual from 'fast-deep-equal';
import { CircleAlert, CircleCheck, CircleSlash, SquareArrowOutUpRight } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useChatStore } from '@/store/chat';

import { dataSelectors, useConversationStore } from '../../store';

interface TaskCallbackMessageProps {
  id: string;
  index: number;
}

type CallbackReason = 'done' | 'error' | 'interrupted';

const reasonMeta: Record<
  CallbackReason,
  {
    className: string;
    i18nKey: 'taskCallback.done' | 'taskCallback.error' | 'taskCallback.interrupted';
    icon: typeof CircleCheck;
  }
> = {
  done: { className: 'text-success-text', i18nKey: 'taskCallback.done', icon: CircleCheck },
  error: { className: 'text-destructive-text', i18nKey: 'taskCallback.error', icon: CircleAlert },
  interrupted: {
    className: 'text-warning-text',
    i18nKey: 'taskCallback.interrupted',
    icon: CircleSlash,
  },
};

/**
 * Renders a `role='taskCallback'` message — the result-bridge card that reports
 * a finished task's handoff back into its creator conversation. The
 * task pointer (identifier / reason / taskId) is carried on
 * `metadata.taskCallback`; the handoff summary lives in the message content.
 * Renders as a standalone card (no avatar bubble), like the verify card.
 */
const TaskCallbackMessage = memo<TaskCallbackMessageProps>(({ id }) => {
  const { t } = useTranslation('chat');
  // Open the task in the right-side detail portal (in-context), instead of
  // navigating away from the conversation to the full task page.
  const openTaskDetail = useChatStore((s) => s.openTaskDetail);
  const item = useConversationStore(dataSelectors.getDisplayMessageById(id), isEqual);

  const callback = item?.metadata?.taskCallback;
  if (!callback) return null;

  const reason = (callback.reason ?? 'done') as CallbackReason;
  const { className, i18nKey, icon } = reasonMeta[reason] ?? reasonMeta.done;
  const content = typeof item?.content === 'string' ? item.content : '';
  const openTask = () => openTaskDetail(callback.identifier);

  const viewTaskButton = (
    <Button size="compact" variant="ghost" onClick={openTask}>
      <SquareArrowOutUpRight data-icon="inline-start" /> {t('taskCallback.viewTask')}
    </Button>
  );

  return (
    <div className="flex flex-col py-2">
      <div className="flex flex-col gap-2 overflow-hidden rounded-(--radius-card) border border-divider bg-card px-4 py-3 text-sm leading-5.5">
        <div className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            {createElement(icon, { className, size: 16 })}
            <div className="font-semibold">{t(i18nKey)}</div>
            <span className="font-mono text-xs leading-5 text-muted-foreground">
              {callback.identifier}
            </span>
          </div>
          {viewTaskButton}
        </div>
        {content ? (
          <Markdown fontSize={14} lineHeight={22 / 14} variant={'chat'}>
            {content}
          </Markdown>
        ) : null}
      </div>
    </div>
  );
});

TaskCallbackMessage.displayName = 'TaskCallbackMessage';

export default TaskCallbackMessage;
