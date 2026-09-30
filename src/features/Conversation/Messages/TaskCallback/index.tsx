'use client';
import { Markdown } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import isEqual from 'fast-deep-equal';
import { CircleAlert, CircleCheck, CircleSlash, SquareArrowOutUpRight } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useChatStore } from '@/store/chat';

import { dataSelectors, useConversationStore } from '../../store';

const styles = createStaticStyles(({ css, cssVar }) => ({
  card: css`
    overflow: hidden;

    padding-block: 12px;
    padding-inline: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 16px;

    background: ${cssVar.colorBgElevated};
  `,
  identifier: css`
    font-family: ${cssVar.fontFamilyCode};
    color: ${cssVar.colorTextSecondary};
  `,
}));

interface TaskCallbackMessageProps {
  id: string;
  index: number;
}

type CallbackReason = 'done' | 'error' | 'interrupted';

const reasonMeta: Record<
  CallbackReason,
  {
    color: keyof typeof cssVar;
    i18nKey: 'taskCallback.done' | 'taskCallback.error' | 'taskCallback.interrupted';
    icon: typeof CircleCheck;
  }
> = {
  done: { color: 'colorSuccess', i18nKey: 'taskCallback.done', icon: CircleCheck },
  error: { color: 'colorError', i18nKey: 'taskCallback.error', icon: CircleAlert },
  interrupted: { color: 'colorWarning', i18nKey: 'taskCallback.interrupted', icon: CircleSlash },
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
  const { color, i18nKey, icon } = reasonMeta[reason] ?? reasonMeta.done;
  const content = typeof item?.content === 'string' ? item.content : '';
  const openTask = () => openTaskDetail(callback.identifier);

  const viewTaskButton = (
    <Button size="sm" variant="ghost" onClick={openTask}>
      <SquareArrowOutUpRight data-icon="inline-start" /> {t('taskCallback.viewTask')}
    </Button>
  );

  return (
    <div className="flex flex-col py-2">
      <div className={cn('flex flex-col gap-2', styles.card)}>
        <div className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            {createElement(icon, { color: cssVar[color], size: 18 })}
            <div className="font-semibold">{t(i18nKey)}</div>
            <span className={styles.identifier}>{callback.identifier}</span>
          </div>
          {viewTaskButton}
        </div>
        {content ? <Markdown variant={'chat'}>{content}</Markdown> : null}
      </div>
    </div>
  );
});

TaskCallbackMessage.displayName = 'TaskCallbackMessage';

export default TaskCallbackMessage;
