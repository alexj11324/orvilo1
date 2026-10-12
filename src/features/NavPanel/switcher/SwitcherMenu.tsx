import { cn } from 'cn';
import { SearchIcon } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import { Input } from '@/components/ui/input';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';

import { filterSwitcherItems, pickRecentItems, type SwitcherItem } from './switcherItems';
import SwitcherRow from './SwitcherRow';
import { useSwitcherRecents } from './useSwitcherRecents';

const styles = {
  list: 'min-h-0 [max-height:min(calc(var(--spacing)*90),50vh)] flex-auto overflow-y-auto overscroll-contain -mbe-(--switcher-inset) -mx-(--switcher-inset) pbs-1 pbe-(--switcher-inset) px-(--switcher-inset)',
  root: '[--switcher-inset:calc(var(--spacing)*1.5)] [max-height:min(calc(var(--spacing)*105),70vh)] overflow-hidden p-(--switcher-inset)',
  search: 'flex-none -mx-(--switcher-inset) border-be border-divider px-3.5 pbs-0.5 pbe-2',
  section: 'px-2 pbs-1.5 pbe-0.5 text-xs leading-5 font-medium text-foreground-tertiary',
};

interface SwitcherMenuProps {
  activeId?: string;
  closePopover?: () => void;
  error?: unknown;
  isLoading?: boolean;
  items: SwitcherItem[];
  kind: 'agent' | 'project';
  onRetry?: () => void;
  onSelect: (id: string) => void;
  searchPlaceholder: string;
}

const SwitcherMenu = memo<SwitcherMenuProps>(
  ({
    activeId,
    closePopover,
    error,
    isLoading,
    items,
    kind,
    onRetry,
    onSelect,
    searchPlaceholder,
  }) => {
    const { t } = useTranslation('common');
    const { ids, touch } = useSwitcherRecents(kind);
    const [query, setQuery] = useState('');

    useEffect(() => {
      if (activeId) touch(activeId);
    }, [activeId, touch]);

    const searching = query.trim().length > 0;
    const visibleItems = useMemo(() => filterSwitcherItems(items, query), [items, query]);
    const recentItems = useMemo(
      () => (searching ? [] : pickRecentItems(ids, items, { excludeId: activeId })),
      [activeId, ids, items, searching],
    );

    const handleSelect = (id: string) => {
      touch(id);
      closePopover?.();
      if (id !== activeId) onSelect(id);
    };

    const showRecent = recentItems.length > 0;

    return (
      <div className={cn(styles.root, 'flex flex-col')}>
        <div className={styles.search}>
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute start-0 [inset-block-start:50%] -translate-y-1/2 text-foreground-tertiary"
              size={16}
            />
            <Input
              autoFocus
              className="border-none bg-transparent ps-6 shadow-none dark:bg-transparent"
              placeholder={searchPlaceholder}
              value={query}
              visualSize="normal"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  const first = visibleItems[0];
                  if (first) handleSelect(first.id);
                }
              }}
            />
          </div>
        </div>
        <AsyncBoundary
          data={isLoading ? undefined : items}
          error={error}
          errorVariant={'inline'}
          isEmpty={searching && visibleItems.length === 0}
          isLoading={isLoading}
          loading={<SkeletonList rows={4} />}
          empty={
            <div className="flex flex-col items-center p-4">
              <div className="text-sm text-muted-foreground">{t('navPanel.searchResultEmpty')}</div>
            </div>
          }
          onRetry={onRetry}
        >
          <div className={styles.list}>
            <div className="flex flex-col">
              {showRecent && (
                <>
                  <div className={styles.section}>
                    {t('navPanel.switcherRecent', { defaultValue: 'Recent' })}
                  </div>
                  {recentItems.map((item) => (
                    <SwitcherRow
                      item={item}
                      key={`recent-${item.id}`}
                      privateLabel={t('navPanel.privateAgents')}
                      onSelect={handleSelect}
                    />
                  ))}
                </>
              )}
              {showRecent && (
                <div className={styles.section}>
                  {t('navPanel.switcherAll', { defaultValue: 'All' })}
                </div>
              )}
              {visibleItems.map((item) => (
                <SwitcherRow
                  active={item.id === activeId}
                  item={item}
                  key={item.id}
                  privateLabel={t('navPanel.privateAgents')}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          </div>
        </AsyncBoundary>
      </div>
    );
  },
);

SwitcherMenu.displayName = 'SwitcherMenu';

export default SwitcherMenu;
