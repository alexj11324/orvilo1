import type { ParseKeys } from 'i18next';
import {
  Brain,
  FileText,
  Filter,
  Folder,
  Library,
  ListTodo,
  MessageCircle,
  MessageSquare,
  SearchIcon,
  Sparkles,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import { savedViewTitle } from '@/features/SavedViews/savedViewTitle';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import type { GlobalSearchResult } from '@/services/globalSearch';

import { globalSearchResultHref, globalSearchResultSubtitle } from './groupSearchResults';
import type { GlobalSearchDisplayType, GlobalSearchGroup } from './types';

const styles = {
  error: 'py-3 px-4 text-sm text-destructive-text',
  groupHeading: 'pbs-2.5 pbe-1 px-4 text-xs font-medium text-foreground-description',
  notice: 'py-2 px-4 text-xs text-foreground-description',
  row: 'flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-(--radius-button) border-0 bg-transparent py-2 px-4 text-start text-sm text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 pointer-coarse:min-h-11',
  rowIcon: 'grid shrink-0 place-items-center text-foreground-description',
  rowSubtitle:
    'overflow-hidden text-xs text-foreground-description text-ellipsis whitespace-nowrap',
  rowTitle: 'overflow-hidden text-ellipsis whitespace-nowrap',
  skeleton: 'animate-none',
  skeletonRow: 'flex min-h-9 items-center gap-2.5 py-2 px-4',
};

/** Group headings reuse the palette's shipped plural labels. */
const GROUP_LABEL_KEYS: Record<GlobalSearchDisplayType, ParseKeys<'common'>> = {
  agent: 'cmdk.search.agents',
  chatGroup: 'cmdk.search.chatGroups',
  file: 'cmdk.search.files',
  folder: 'cmdk.search.folders',
  knowledgeBase: 'cmdk.search.knowledgeBases',
  memory: 'cmdk.search.memories',
  message: 'cmdk.search.messages',
  page: 'cmdk.search.pages',
  project: 'cmdk.search.projects',
  savedView: 'cmdk.search.savedViews',
  task: 'cmdk.search.tasks',
  team: 'cmdk.search.teams',
  topic: 'cmdk.search.topics',
};

const TYPE_ICONS: Record<GlobalSearchDisplayType, ReactNode> = {
  agent: <Sparkles size={16} />,
  chatGroup: <Users size={16} />,
  file: <FileText size={16} />,
  folder: <Folder size={16} />,
  knowledgeBase: <Library size={16} />,
  memory: <Brain size={16} />,
  message: <MessageCircle size={16} />,
  page: <FileText size={16} />,
  project: <PROJECT_ENTITY_ICON size={16} />,
  savedView: <Filter size={16} />,
  task: <ListTodo size={16} />,
  team: <Users size={16} />,
  topic: <MessageSquare size={16} />,
};

export interface GlobalSearchResultsProps {
  /** Fetch-level failure — replaces results with an honest error row. */
  error?: unknown;
  groups: GlobalSearchGroup[];
  isLoading?: boolean;
  /** Override result handling; defaults to navigating to the result's href. */
  onSelect?: (result: GlobalSearchResult) => void;
  /** The searched query — shown in the empty state. */
  query: string;
  /** Work slice failed — results render with a partial-results notice. */
  workFailed?: boolean;
}

/**
 * Minimal mountable search-results surface: grouped sections with type
 * headings and identifier subtitles, honest loading / error / empty states,
 * and click-to-navigate rows. Any entry point (command palette, sidebar
 * quick search, standalone page) mounts this plus `useGlobalSearch`.
 */
const GlobalSearchResults = ({
  error,
  groups,
  isLoading,
  onSelect,
  query,
  workFailed,
}: GlobalSearchResultsProps) => {
  const { t } = useTranslation('common');
  const navigate = useWorkspaceAwareNavigate();

  const handleSelect = (result: GlobalSearchResult) => {
    if (onSelect) {
      onSelect(result);
      return;
    }
    const href = globalSearchResultHref(result);
    if (href) navigate(href);
  };

  const resultTitle = (result: GlobalSearchResult) =>
    result.type === 'savedView' ? savedViewTitle(result.id, result.title, t) : result.title;

  if (error) {
    return (
      <div className={styles.error} role="alert">
        {t('globalSearch.error')}
      </div>
    );
  }

  if (isLoading && groups.length === 0) {
    return (
      <div aria-busy="true" aria-label={t('globalSearch.loading')}>
        {[1, 2, 3].map((i) => (
          <div className={styles.skeletonRow} key={`skeleton-${i}`}>
            <Skeleton className={`${styles.skeleton} size-4`} />
            <div className="flex flex-col flex-1 gap-0.5">
              <Skeleton
                className={`${styles.skeleton} h-5.5`}
                style={{ width: `${55 + i * 10}%` }}
              />
              <Skeleton className={`${styles.skeleton} h-5`} style={{ width: `${35 + i * 5}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <Empty className="rounded-(--radius-card)">
        <EmptyHeader>
          <EmptyMedia className="rounded-(--radius-card)" variant="icon">
            <SearchIcon />
          </EmptyMedia>
          <EmptyDescription className="text-sm leading-5.5">
            {t('globalSearch.empty', { query })}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div>
      {workFailed && <div className={styles.notice}>{t('globalSearch.partialResults')}</div>}
      {groups.map((group) => (
        <section key={group.type}>
          <div className={styles.groupHeading}>{t(GROUP_LABEL_KEYS[group.type])}</div>
          {group.items.map((result) => {
            const subtitle = globalSearchResultSubtitle(result);
            return (
              <button
                className={styles.row}
                key={`${result.type}-${result.id}`}
                type="button"
                onClick={() => handleSelect(result)}
              >
                <span className={styles.rowIcon}>{TYPE_ICONS[group.type]}</span>
                <div className="flex flex-col flex-1 min-w-0 gap-0.5">
                  <span className={styles.rowTitle}>{resultTitle(result)}</span>
                  {subtitle && <span className={styles.rowSubtitle}>{subtitle}</span>}
                </div>
              </button>
            );
          })}
        </section>
      ))}
      {isLoading && (
        <div className={styles.skeletonRow}>
          <Skeleton className={`${styles.skeleton} size-4`} />
          <Skeleton className={`${styles.skeleton} h-5.5 w-3/5`} />
        </div>
      )}
    </div>
  );
};

export default GlobalSearchResults;
