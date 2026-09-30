import type { ChatTopicStatus, TaskStatus } from '@orvilo/types';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { TASK_STATUS_VISUALS, TOPIC_STATUS_VISUALS } from '@/components/ExecutionStatus';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface StatusGlyphProps {
  size?: number;
  status: ChatTopicStatus | TaskStatus;
  /** Tasks and topics share the visual family but not the full status set. */
  variant: 'task' | 'topic';
}

/**
 * The one true status glyph, straight from `ExecutionStatus.ts` — never invent
 * a second icon set for the same state. Note `task:paused` deliberately renders
 * as the "waiting for human" hand: it means *pending review*, not "suspended".
 */
const StatusGlyph = memo<StatusGlyphProps>(({ status, variant, size = 14 }) => {
  const { t } = useTranslation('chat');

  const visual =
    variant === 'task'
      ? TASK_STATUS_VISUALS[status as TaskStatus]
      : TOPIC_STATUS_VISUALS[status as ChatTopicStatus];

  if (!visual) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex">
              <div className="flex flex-col flex-none">
                {createElement(visual.icon, { color: visual.color, size })}
              </div>
            </span>
          }
        />
        <TooltipContent>
          {t(`taskDetail.status.${status}`, { defaultValue: status })}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

export default StatusGlyph;
