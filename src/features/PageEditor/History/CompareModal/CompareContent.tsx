'use client';

import { cn } from 'cn';
import dayjs from 'dayjs';
import { RotateCcwIcon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuthorInfo } from '@/business/client/hooks/useAuthorInfo';
import { Button } from '@/components/ui/button';
import type {
  DocumentHistoryListItem,
  DocumentHistorySaveSource,
} from '@/server/routers/lambda/_schema/documentHistory';

import DocumentHistoryDiff from '../DocumentHistoryDiff';
import { formatHistoryAbsoluteTime } from '../formatHistoryDate';
import HistorySidebar from './HistorySidebar';

const styles = {
  arrow: 'text-xs leading-5 text-foreground-tertiary',
  badgeNew:
    'inline-flex items-center gap-1 rounded-(--radius-chip) py-0.5 px-2 text-xs leading-5 font-semibold text-success-text bg-success-wash',
  badgeOld:
    'inline-flex items-center rounded-(--radius-chip) py-0.5 px-2 text-xs leading-5 font-semibold text-destructive-text bg-destructive-wash',
  cmpbar: 'flex items-center justify-between border-b border-divider bg-background py-2.5 px-4',
  diffArea: 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
  diffBody: 'min-h-0 flex-1 overflow-auto',
  meta: 'ms-2 text-xs leading-5',
  root: 'flex h-full w-full overflow-hidden bg-card',
};

export interface CompareContentProps {
  documentId: string;
  initialHistoryId: string;
  items: DocumentHistoryListItem[];
  onRestore: (item: DocumentHistoryListItem) => void;
  saveSourceLabels: Record<DocumentHistorySaveSource, string>;
}

const CompareContent = memo<CompareContentProps>(
  ({ documentId, initialHistoryId, items, onRestore, saveSourceLabels }) => {
    const { t } = useTranslation('file');

    const [selectedHistoryId, setSelectedHistoryId] = useState<string>(initialHistoryId);

    const selectedItem = useMemo(
      () => items.find((item) => item.id === selectedHistoryId) ?? null,
      [items, selectedHistoryId],
    );

    const authorInfo = useAuthorInfo(selectedItem?.userId);

    if (!selectedItem) return null;

    const canRestore = !selectedItem.isCurrent;

    return (
      <div className={styles.root}>
        <div className={styles.diffArea}>
          <div className={styles.cmpbar}>
            <div className="flex items-center gap-1">
              <span className={styles.badgeNew}>{t('pageEditor.history.compareCurrentLabel')}</span>
              <div className={styles.arrow}>→</div>
              <span className={styles.badgeOld}>
                {formatHistoryAbsoluteTime(selectedItem.savedAt)}
              </span>
              <div className={cn('text-muted-foreground', styles.meta)}>
                {dayjs(selectedItem.savedAt).fromNow()} ·{' '}
                {saveSourceLabels[selectedItem.saveSource]}
              </div>
              {authorInfo?.fullName && (
                <div
                  className={cn('text-muted-foreground', styles.meta)}
                  title={authorInfo.fullName}
                >
                  · {authorInfo.fullName}
                </div>
              )}
            </div>
            {canRestore && (
              <Button
                className="text-sm leading-5.5"
                size="compact"
                variant="outline"
                onClick={() => onRestore(selectedItem)}
              >
                <RotateCcwIcon data-icon="inline-start" />
                {t('pageEditor.history.restore')} {formatHistoryAbsoluteTime(selectedItem.savedAt)}
              </Button>
            )}
          </div>
          <div className={styles.diffBody}>
            <DocumentHistoryDiff documentId={documentId} historyId={selectedItem.id} />
          </div>
        </div>
        <HistorySidebar
          items={items}
          saveSourceLabels={saveSourceLabels}
          selectedHistoryId={selectedHistoryId}
          onSelect={setSelectedHistoryId}
        />
      </div>
    );
  },
);

CompareContent.displayName = 'CompareContent';

export default CompareContent;
