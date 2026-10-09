'use client';

import { createStaticStyles, cssVar, cx } from 'antd-style';
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
  llm_call: 'text-primary',
  manual: 'text-success',
  restore: 'text-info',
  system: 'text-warning',
};

const styles = createStaticStyles(({ css }) => ({
  description: css`
    overflow: hidden;

    font-size: 12px;
    line-height: 1.2;
    color: ${cssVar.colorTextTertiary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  rowMain: css`
    overflow: hidden;
    flex: 1;
    min-width: 0;
  `,
  actions: css`
    pointer-events: none;

    position: absolute;
    inset-block: 50%;
    inset-inline-end: 10px;
    transform: translateY(-50%);

    display: flex;
    gap: 2px;
    align-items: center;

    opacity: 0;

    transition: opacity ${cssVar.motionDurationMid} ${cssVar.motionEaseInOut};
  `,
  currentBadge: css`
    flex-shrink: 0;
    margin: 0;
  `,
  row: css`
    cursor: pointer;

    position: relative;

    display: flex;
    gap: 8px;
    align-items: center;

    padding-block: 8px;
    padding-inline: 16px;

    transition: background ${cssVar.motionDurationMid} ${cssVar.motionEaseInOut};

    &:hover,
    &:focus-within {
      background: ${cssVar.colorFillQuaternary};

      .history-source-tag {
        opacity: 0;
      }

      .history-actions {
        pointer-events: auto;
        opacity: 1;
      }
    }
  `,
  rowCurrent: css`
    cursor: default;

    &:hover,
    &:focus-within {
      background: transparent;

      .history-source-tag {
        opacity: 1;
      }
    }
  `,
  rowRight: css`
    position: relative;

    display: flex;
    flex-shrink: 0;
    gap: 8px;
    align-items: center;

    margin-inline-start: auto;
  `,
  rowTime: css`
    flex-shrink: 0;

    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    color: ${cssVar.colorText};
  `,
  rowTimeCurrent: css`
    font-size: 14px;
    color: ${cssVar.colorPrimary};
  `,
  sourceTag: css`
    flex-shrink: 0;
    margin: 0;
    transition: opacity ${cssVar.motionDurationMid} ${cssVar.motionEaseInOut};
  `,
}));

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
      className={cn(cx(styles.row, item.isCurrent && styles.rowCurrent), CLICKABLE_FOCUS_RING)}
      onClick={item.isCurrent ? undefined : handleCompare}
    >
      <div className={cn('flex flex-col items-start gap-1', styles.rowMain)}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <span style={{ display: 'inline-flex' }}>
                  <span className={cx(styles.rowTime, item.isCurrent && styles.rowTimeCurrent)}>
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
            className={cn(styles.currentBadge, 'bg-transparent text-info')}
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
          <div
            className={cn('flex items-center gap-0.5', cx(styles.actions, 'history-actions'))}
            onClick={handleStopPropagation}
          >
            <ActionIcon
              icon={ArrowLeftRightIcon}
              size={{ blockSize: 26, borderRadius: '50%', size: 14 }}
              title={t('pageEditor.history.compare', { ns: 'file' })}
              onClick={handleCompare}
            />
            <ActionIcon
              icon={RotateCcwIcon}
              loading={isRestoring}
              size={{ blockSize: 26, borderRadius: '50%', size: 14 }}
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
