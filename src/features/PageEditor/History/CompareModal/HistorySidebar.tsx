'use client';

import { formatAbsoluteDate } from '@orvilo/utils/time';
import { cn } from 'cn';
import dayjs from 'dayjs';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuthorInfo } from '@/business/client/hooks/useAuthorInfo';
import { Badge } from '@/components/reui/badge';
import type {
  DocumentHistoryListItem,
  DocumentHistorySaveSource,
} from '@/server/routers/lambda/_schema/documentHistory';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { formatHistoryRowTime } from '../formatHistoryDate';

const styles = {
  container: 'w-58 shrink-0 overflow-y-auto border-s border-divider bg-card pbs-1 pbe-3 px-2',
  // Centre the 8px marker on the rail (8px + half its 1px stroke) and
  // the first body line (4px item inset + half its 22px line box).
  dot: 'absolute inset-bs-[calc(0.25rem_+_1.375rem/2_-_0.5rem/2)] start-[calc(0.5rem_+_1px/2_-_0.5rem/2)] size-2 rounded-full border border-border bg-card shadow-[0_0_0_2px_var(--card)]',
  dotCurrent: 'border-success bg-success',
  dotSelected: 'border-primary bg-primary',
  group: 'relative',
  groupHeader: 'sticky inset-bs-0 z-1 bg-card pbs-2.5 pbe-1.5 ps-6 text-xs leading-5 font-medium',
  item: 'cursor-pointer rounded-(--radius-button) py-1 px-2 transition-[background-color] duration-(--orvilo-motion-mid) ease-(--ant-motion-ease-in-out) motion-reduce:transition-none hover:bg-fill-quaternary',
  itemCurrent: 'cursor-default',
  itemSelected: 'bg-selected hover:bg-selected',
  source: 'ms-auto truncate ps-2 text-xs leading-5 text-foreground-tertiary',
  meta: 'truncate text-xs leading-5',
  rail: 'absolute inset-y-0.5 start-2 w-px bg-secondary',
  row: 'relative ps-6',
  tag: 'h-5 py-0 px-1 text-xs leading-5',
  time: 'text-sm leading-5.5 font-semibold',
};

interface HistoryDayGroup {
  items: DocumentHistoryListItem[];
  key: string;
  label: string;
}

const createGroups = (
  items: DocumentHistoryListItem[],
  formatLabel: (savedAt: string) => string,
): HistoryDayGroup[] => {
  const groups = new Map<string, HistoryDayGroup>();

  for (const item of items) {
    const key = dayjs(item.savedAt).format('YYYY-MM-DD');
    const group = groups.get(key);

    if (group) {
      group.items.push(item);
      continue;
    }

    groups.set(key, {
      items: [item],
      key,
      label: formatLabel(item.savedAt),
    });
  }

  return [...groups.values()];
};

interface HistorySidebarRowProps {
  isSelected: boolean;
  item: DocumentHistoryListItem;
  onSelect: (historyId: string) => void;
  saveSourceLabels: Record<DocumentHistorySaveSource, string>;
}

const HistorySidebarRow = memo<HistorySidebarRowProps>(
  ({ item, isSelected, onSelect, saveSourceLabels }) => {
    const { t } = useTranslation('file');
    const authorInfo = useAuthorInfo(item.userId);
    const disabled = item.isCurrent;

    return (
      <div className={styles.row}>
        <div
          className={cn(
            styles.dot,
            item.isCurrent && styles.dotCurrent,
            !item.isCurrent && isSelected && styles.dotSelected,
          )}
        />
        <div
          {...clickableProps()}
          className={cn(
            styles.item,
            item.isCurrent && styles.itemCurrent,
            !item.isCurrent && isSelected && styles.itemSelected,
            CLICKABLE_FOCUS_RING,
          )}
          onClick={() => {
            if (disabled) return;
            onSelect(item.id);
          }}
        >
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <div className={cn(styles.time)}>{formatHistoryRowTime(item.savedAt)}</div>
              {item.isCurrent && (
                <Badge className={cn(styles.tag, 'bg-transparent')} variant="secondary">
                  {t('pageEditor.history.current')}
                </Badge>
              )}
              <span className={styles.source}>{saveSourceLabels[item.saveSource]}</span>
            </div>
            <div className={cn('text-muted-foreground', styles.meta)}>
              {authorInfo?.fullName ? `${authorInfo.fullName} · ` : ''}
              {dayjs(item.savedAt).fromNow()}
            </div>
          </div>
        </div>
      </div>
    );
  },
);

HistorySidebarRow.displayName = 'HistorySidebarRow';

interface HistorySidebarProps {
  items: DocumentHistoryListItem[];
  onSelect: (historyId: string) => void;
  saveSourceLabels: Record<DocumentHistorySaveSource, string>;
  selectedHistoryId: string | null;
}

const HistorySidebar = memo<HistorySidebarProps>(
  ({ items, onSelect, saveSourceLabels, selectedHistoryId }) => {
    const { t } = useTranslation('file');

    const formatLabel = useCallback(
      (savedAt: string) => {
        const d = dayjs(savedAt);
        if (d.isToday()) return t('pageEditor.history.dayLabel.today');
        if (d.isYesterday()) return t('pageEditor.history.dayLabel.yesterday');
        return formatAbsoluteDate(d);
      },
      [t],
    );

    const groups = useMemo(() => createGroups(items, formatLabel), [formatLabel, items]);

    return (
      <div className={styles.container}>
        {groups.map((group) => (
          <div className="flex flex-col gap-0" key={group.key}>
            <div className={styles.groupHeader}>
              <div className="text-muted-foreground">{group.label}</div>
            </div>
            <div className={styles.group}>
              <div className={styles.rail} />
              {group.items.map((item) => (
                <HistorySidebarRow
                  isSelected={selectedHistoryId === item.id}
                  item={item}
                  key={item.id}
                  saveSourceLabels={saveSourceLabels}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  },
);

HistorySidebar.displayName = 'HistorySidebar';

export default HistorySidebar;
