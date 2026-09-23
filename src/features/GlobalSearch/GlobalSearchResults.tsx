import { Empty, Flexbox } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import {
  Brain,
  FileText,
  Filter,
  Folder,
  FolderKanban,
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

import { savedViewTitle } from '@/features/SavedViews/savedViewTitle';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import type { GlobalSearchResult } from '@/services/globalSearch';

import { globalSearchResultHref, globalSearchResultSubtitle } from './groupSearchResults';
import type { GlobalSearchDisplayType, GlobalSearchGroup } from './types';

const styles = createStaticStyles(({ css }) => ({
  error: css`
    padding-block: 12px;
    padding-inline: 16px;
    font-size: 13px;
    color: ${cssVar.colorError};
  `,
  groupHeading: css`
    padding-block: 10px 4px;
    padding-inline: 16px;

    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextDescription};
  `,
  notice: css`
    padding-block: 8px;
    padding-inline: 16px;
    font-size: 12px;
    color: ${cssVar.colorTextDescription};
  `,
  row: css`
    cursor: pointer;

    display: flex;
    gap: 10px;
    align-items: center;

    width: 100%;
    padding-block: 8px;
    padding-inline: 16px;
    border: none;
    border-radius: ${cssVar.borderRadius};

    font-size: 14px;
    color: ${cssVar.colorText};
    text-align: start;

    background: transparent;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  rowIcon: css`
    display: grid;
    flex-shrink: 0;
    place-items: center;
    color: ${cssVar.colorTextDescription};
  `,
  rowSubtitle: css`
    overflow: hidden;

    font-size: 12px;
    color: ${cssVar.colorTextDescription};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  rowTitle: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  skeleton: css`
    height: 14px;
    border-radius: ${cssVar.borderRadiusSM};
    background: ${cssVar.colorFillSecondary};
  `,
  skeletonRow: css`
    display: flex;
    gap: 10px;
    align-items: center;

    padding-block: 8px;
    padding-inline: 16px;
  `,
}));

/** Group headings reuse the palette's shipped plural labels. */
const GROUP_LABEL_KEYS: Record<GlobalSearchDisplayType, string> = {
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
  project: <FolderKanban size={16} />,
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
            <div className={styles.skeleton} style={{ height: 20, width: 20 }} />
            <Flexbox flex={1} gap={6}>
              <div className={styles.skeleton} style={{ width: `${55 + i * 10}%` }} />
              <div className={styles.skeleton} style={{ height: 10, width: `${35 + i * 5}%` }} />
            </Flexbox>
          </div>
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return <Empty description={t('globalSearch.empty', { query })} icon={SearchIcon} />;
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
                <Flexbox flex={1} gap={2} style={{ minWidth: 0 }}>
                  <span className={styles.rowTitle}>{resultTitle(result)}</span>
                  {subtitle && <span className={styles.rowSubtitle}>{subtitle}</span>}
                </Flexbox>
              </button>
            );
          })}
        </section>
      ))}
      {isLoading && (
        <div className={styles.skeletonRow}>
          <div className={styles.skeleton} style={{ height: 20, width: 20 }} />
          <div className={styles.skeleton} style={{ width: '60%' }} />
        </div>
      )}
    </div>
  );
};

export default GlobalSearchResults;
