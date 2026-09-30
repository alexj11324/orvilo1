'use client';

import { Tag } from '@lobehub/ui/base-ui';
import dayjs from 'dayjs';
import { CloudIcon, Loader2Icon, TriangleAlertIcon } from 'lucide-react';
import { createElement, type CSSProperties } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { type SaveStatus } from '@/types/saveState';

interface AutoSaveHintProps {
  lastUpdatedTime?: string | Date | null;
  /** Called when the user clicks Retry on a failed save. */
  onRetry?: () => void;
  saveStatus: SaveStatus;
  style?: CSSProperties;
}

/**
 * AutoSaveHint - Unified save status indicator for editors
 *
 * Displays real-time save status for document/config changes. The `failed`
 * state renders an error tag with an inline Retry so a
 * silent save failure can never masquerade as "Latest version loaded".
 */
const AutoSaveHint = memo<AutoSaveHintProps>(({ style, saveStatus, lastUpdatedTime, onRetry }) => {
  const { t } = useTranslation('editor');

  if (saveStatus === 'saving')
    return (
      <Tag icon={createElement(Loader2Icon, { size: 16 })} style={style}>
        {t('autoSave.saving')}
      </Tag>
    );

  if (saveStatus === 'failed')
    return (
      <Tag
        color={'error'}
        icon={createElement(TriangleAlertIcon, { size: 16 })}
        style={{ cursor: onRetry ? 'pointer' : undefined, ...style }}
        onClick={onRetry}
      >
        {t('autoSave.failed')}
        {onRetry ? ` · ${t('autoSave.retry')}` : ''}
      </Tag>
    );

  if (saveStatus === 'saved' && lastUpdatedTime)
    return (
      <Tag icon={createElement(CloudIcon, { size: 16 })} style={style}>
        {t('autoSave.saved')} {dayjs(lastUpdatedTime).fromNow()}
      </Tag>
    );

  return (
    <Tag icon={createElement(CloudIcon, { size: 16 })} style={style}>
      {t('autoSave.latest')}
    </Tag>
  );
});

export default AutoSaveHint;
