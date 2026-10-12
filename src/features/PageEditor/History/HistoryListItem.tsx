'use client';

import { cn } from 'cn';
import dayjs from 'dayjs';
import { ArrowLeftRightIcon, RotateCcwIcon } from 'lucide-react';
import type { MouseEvent } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuthorInfo } from '@/business/client/hooks/useAuthorInfo';
import ActionIcon from '@/components/ActionIcon';
import { Badge } from '@/components/reui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useEventCallback } from '@/hooks/useEventCallback';
import type { DocumentHistorySaveSource } from '@/server/routers/lambda/_schema/documentHistory';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { formatHistoryAbsoluteTime, formatHistoryRowTime } from './formatHistoryDate';
import { historyItemSelectors, useHistoryItemsStore } from './HistoryItemsProvider';

const SOURCE_TAG_CLASS: Record<DocumentHistorySaveSource, string> = {
  autosave: 'text-muted-foreground',
  llm_call: 'text-primary-text',
  manual: 'text-success-text',
  restore: 'text-info-text',
  system: 'text-warning-text',
};

const styles = {
  description: 'truncate text-xs leading-5 text-foreground-tertiary',
  rowMain: 'min-w-0 flex-1 overflow-hidden',
  actions:
    'pointer-events-none absolute inset-y-1/2 end-2.5 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity duration-(--orvilo-motion-mid) ease-(--ant-motion-ease-in-out) motion-reduce:transition-none group-hover/history-row:pointer-events-auto group-focus-within/history-row:pointer-events-auto group-hover/history-row:opacity-100 group-focus-within/history-row:opacity-100',
  currentBadge: 'm-0 h-5 shrink-0 py-0 text-xs leading-5',
  row: 'group/history-row relative flex cursor-pointer items-center gap-2 py-2 px-4 transition-[background-color] duration-(--orvilo-motion-mid) ease-(--ant-motion-ease-in-out) motion-reduce:transition-none hover:bg-fill-quaternary focus-within:bg-fill-quaternary',
  rowCurrent: 'cursor-default hover:bg-transparent focus-within:bg-transparent',
  rowRight: 'relative ms-auto flex shrink-0 items-center gap-2',
  rowTime: 'shrink-0 text-sm leading-5.5 font-semibold tabular-nums text-foreground',
  rowTimeCurrent: 'text-primary-text',
  sourceTag:
    'm-0 h-5 shrink-0 py-0 text-xs leading-5 transition-opacity duration-(--orvilo-motion-mid) ease-(--ant-motion-ease-in-out) motion-reduce:transition-none group-hover/history-row:opacity-0 group-focus-within/history-row:opacity-0',
};

export interface HistoryListItemProps {
  historyId: string;
  onCompare: (historyId: string) => void;
  onRestore: (historyId: string) => void;
}

export const HistoryListItem = memo<HistoryListItemProps>(({ historyId, onCompare, onRestore }) => {
  const { t } = useTranslation(['common', 'file']);
  const item = useHistoryItemsStore(historyItemSelectors.itemById(historyId));
  const isRestoring = useHistoryItemsStore(historyItemSelectors.isRestoring(historyId));
  const authorInfo = useAuthorInfo(item?.userId);

  const handleCompare = useEventCallback(() => {
    onCompare(historyId);
  });

  const handleRestore = useEventCallback(() => {
    onRestore(historyId);
  });

  const handleStopPropagation = useEventCallback((event: MouseEvent) => {
    event.stopPropagation();
  });

  if (!item) return null;

  const timeLabel = formatHistoryRowTime(item.savedAt);
  const saveSourceLabel = t(`pageEditor.history.saveSource.${item.saveSource}`, { ns: 'file' });

  return (
    <div
      {...clickableProps(!item.isCurrent)}
      className={cn(styles.row, item.isCurrent && styles.rowCurrent, CLICKABLE_FOCUS_RING)}
      onClick={item.isCurrent ? undefined : handleCompare}
    >
      <div className={cn('flex flex-col items-start gap-1', styles.rowMain)}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex">
                  <span className={cn(styles.rowTime, item.isCurrent && styles.rowTimeCurrent)}>
                    {timeLabel}
                  </span>
                </span>
              }
            />
            <TooltipContent>{formatHistoryAbsoluteTime(item.savedAt)}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span className={styles.description}>
          {authorInfo?.fullName ? `${authorInfo.fullName} · ` : ''}
          {dayjs(item.savedAt).fromNow()}
        </span>
      </div>

      <div className={styles.rowRight}>
        {item.isCurrent && (
          <Badge
            className={cn(styles.currentBadge, 'bg-transparent text-info-text')}
            size="sm"
            variant="secondary"
          >
            {t('pageEditor.history.current', { ns: 'file' })}
          </Badge>
        )}

        {!item.isCurrent && (
          <Badge
            size="sm"
            variant="secondary"
            className={cn(
              styles.sourceTag,
              'history-source-tag',
              'bg-transparent',
              SOURCE_TAG_CLASS[item.saveSource],
            )}
          >
            {saveSourceLabel}
          </Badge>
        )}
        {!item.isCurrent && (
          <div className={cn(styles.actions, 'history-actions')} onClick={handleStopPropagation}>
            <ActionIcon
              icon={ArrowLeftRightIcon}
              size={{ blockSize: 32, borderRadius: '50%', size: 16 }}
              title={t('pageEditor.history.compare', { ns: 'file' })}
              onClick={handleCompare}
            />
            <ActionIcon
              icon={RotateCcwIcon}
              loading={isRestoring}
              size={{ blockSize: 32, borderRadius: '50%', size: 16 }}
              title={t('pageEditor.history.restore', { ns: 'file' })}
              onClick={handleRestore}
            />
          </div>
        )}
      </div>
    </div>
  );
});

HistoryListItem.displayName = 'HistoryListItem';
