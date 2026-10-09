'use client';

import dayjs from 'dayjs';
import { CloudIcon, TriangleAlertIcon } from 'lucide-react';
import { createElement, type CSSProperties } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { Spinner } from '@/components/ui/spinner';
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
      <Badge style={style} variant="secondary">
        <Spinner />
        {t('autoSave.saving')}
      </Badge>
    );

  if (saveStatus === 'failed')
    return (
      <Badge
        style={{ cursor: onRetry ? 'pointer' : undefined, ...style }}
        variant="destructive"
        onClick={onRetry}
      >
        {createElement(TriangleAlertIcon, { size: 16 })}
        {t('autoSave.failed')}
        {onRetry ? ` · ${t('autoSave.retry')}` : ''}
      </Badge>
    );

  if (saveStatus === 'saved' && lastUpdatedTime)
    return (
      <Badge style={style} variant="secondary">
        {createElement(CloudIcon, { size: 16 })}
        {t('autoSave.saved')} {dayjs(lastUpdatedTime).fromNow()}
      </Badge>
    );

  return (
    <Badge style={style} variant="secondary">
      {createElement(CloudIcon, { size: 16 })}
      {t('autoSave.latest')}
    </Badge>
  );
});

export default AutoSaveHint;
