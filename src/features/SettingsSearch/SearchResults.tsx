'use client';

import { createStaticStyles } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { SidebarMenu } from '@/components/ui/sidebar';
import { Spinner } from '@/components/ui/spinner';
import NavItem from '@/features/NavPanel/components/SidebarNavItem';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { isModifierClick } from '@/utils/navigation';

import { useSettingsSearchAnalytics } from './analytics';
import type { SettingsSearchResult } from './useSettingsSearch';

const styles = createStaticStyles(({ css }) => ({
  match: css`
    color: var(--sidebar-primary);
  `,
}));

const HighlightMatch = memo<{ query: string; text: string }>(({ text, query }) => {
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return text;

  return (
    <>
      {text.slice(0, index)}
      <span className={styles.match}>{text.slice(index, index + query.length)}</span>
      {text.slice(index + query.length)}
    </>
  );
});

HighlightMatch.displayName = 'HighlightMatch';

interface SearchResultsProps {
  isIndexing: boolean;
  query: string;
  results: SettingsSearchResult[];
}

/**
 * Mounted only while the query is non-empty — the analytics hook relies on
 * this lifecycle: unmount (input cleared / left settings) ends the search
 * session and may emit the abandoned event.
 */
const SearchResults = memo<SearchResultsProps>(({ isIndexing, query, results }) => {
  const { t } = useTranslation('setting');
  const navigate = useWorkspaceAwareNavigate();
  const { trackResultClick } = useSettingsSearchAnalytics(query, results, isIndexing);
  const keyword = query.trim();

  if (results.length === 0)
    return (
      <div className="flex flex-col items-center" style={{ paddingBlock: 24, paddingInline: 8 }}>
        {isIndexing ? (
          // A zero-result answer is not authoritative while the pinyin dict is
          // still loading — show a spinner instead of a false empty state.
          <Spinner className="text-[var(--sidebar-muted)]" />
        ) : (
          <span className="text-xs text-[var(--sidebar-muted)]">
            {t('settingsSearch.empty', { keyword })}
          </span>
        )}
      </div>
    );

  return (
    <SidebarMenu className="gap-0.25 py-1">
      {results.map((result, index) => (
        <NavItem
          href={result.url}
          icon={result.icon}
          key={result.key}
          title={<HighlightMatch query={keyword} text={result.label} />}
          description={
            <span className="truncate text-xs text-[var(--sidebar-muted)]">
              {result.breadcrumb}
            </span>
          }
          onClick={(e) => {
            trackResultClick(result, index + 1);
            // Modifier clicks (cmd/ctrl) open a new tab via the href; don't also
            // navigate the current tab.
            if (isModifierClick(e)) return;
            navigate(result.url, { escape: true });
          }}
        />
      ))}
    </SidebarMenu>
  );
});

SearchResults.displayName = 'SearchResults';

export default SearchResults;
