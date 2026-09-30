import { Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { SearchIcon } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import { Input } from '@/components/ui/input';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';

import { filterSwitcherItems, pickRecentItems, type SwitcherItem } from './switcherItems';
import SwitcherRow from './SwitcherRow';
import { useSwitcherRecents } from './useSwitcherRecents';

const styles = createStaticStyles(({ css, cssVar }) => ({
  list: css`
    overflow-y: auto;
    overscroll-behavior: contain;
    flex: 1 1 auto;

    min-height: 0;
    max-height: min(360px, 50vh);
    margin-block-end: calc(var(--switcher-inset) * -1);
    margin-inline: calc(var(--switcher-inset) * -1);
    padding-block: 4px var(--switcher-inset);
    padding-inline: var(--switcher-inset);
  `,
  root: css`
    --switcher-inset: 6px;

    overflow: hidden;
    max-height: min(420px, 70vh);
    padding: var(--switcher-inset);
  `,
  search: css`
    flex: none;

    margin-inline: calc(var(--switcher-inset) * -1);
    padding-block: 2px 8px;
    padding-inline: 14px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    .ant-input-affix-wrapper,
    .ant-input {
      padding-inline: 0;
      border: none !important;
      background: transparent !important;
      box-shadow: none !important;
    }
  `,
  section: css`
    padding-block: 6px 2px;
    padding-inline: 8px;

    font-size: 12px;
    font-weight: 500;
    line-height: 16px;
    color: ${cssVar.colorTextTertiary};
  `,
}));

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
      <div className={cx(styles.root, 'flex flex-col')}>
        <div className={styles.search}>
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2"
              size={14}
              style={{ color: cssVar.colorTextTertiary }}
            />
            <Input
              autoFocus
              className="h-6 border-none bg-transparent pl-5 shadow-none"
              placeholder={searchPlaceholder}
              value={query}
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
              <Text fontSize={13} type={'secondary'}>
                {t('navPanel.searchResultEmpty')}
              </Text>
            </div>
          }
          onRetry={onRetry}
        >
          <div className={styles.list}>
            <div className="flex flex-col">
              {showRecent && (
                <>
                  <Text as={'div'} className={styles.section}>
                    {t('navPanel.switcherRecent', { defaultValue: 'Recent' })}
                  </Text>
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
                <Text as={'div'} className={styles.section}>
                  {t('navPanel.switcherAll', { defaultValue: 'All' })}
                </Text>
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
