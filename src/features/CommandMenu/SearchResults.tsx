import { Flexbox } from '@lobehub/ui';
import {
  AGENT_CHAT_TOPIC_URL,
  DEFAULT_AVATAR,
  GROUP_CHAT_TOPIC_URL,
  GROUP_CHAT_URL,
} from '@orvilo/const';
import { agentDisplayName } from '@orvilo/types';
import { Command } from 'cmdk';
import dayjs from 'dayjs';
import {
  Brain,
  FileText,
  Filter,
  Folder,
  Library,
  ListTodo,
  MessageCircle,
  MessageSquare,
  Sparkles,
  Users,
} from 'lucide-react';
import { memo, type ReactNode, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import type { FtsSearchResult } from '@/database/repositories/ftsSearch';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import { savedViewTitle } from '@/features/SavedViews/savedViewTitle';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { markdownToTxt } from '@/utils/markdownToTxt';

import type { CommandMenuResultClick } from './analytics';
import { CommandItem } from './components';
import { styles } from './styles';
import { groupSearchResults } from './utils/groupResults';
import {
  type CommandMenuWorkType,
  isValidSearchType,
  type ValidSearchType,
} from './utils/queryParser';
import { createVisibleResultPositionMap } from './utils/visibleResultPosition';

export interface CommandMenuWorkResult {
  createdAt: Date;
  description?: string | null;
  id: string;
  relevance: number;
  title: string;
  type: CommandMenuWorkType;
  updatedAt: Date;
}

export type CommandMenuSearchResult = FtsSearchResult | CommandMenuWorkResult;

interface SearchResultsProps {
  isLoading: boolean;
  onClose: () => void;
  onResultClick: (input: CommandMenuResultClick) => void;
  onSetTypeFilter: (typeFilter: ValidSearchType | undefined) => void;
  onTypeFilterChange: () => void;
  onVisibleResultCountChange: (count: number) => void;
  results: CommandMenuSearchResult[];
  searchQuery: string;
  typeFilter: ValidSearchType | undefined;
}

/**
 * Search results from unified search index.
 */
const SearchResults = memo<SearchResultsProps>(
  ({
    isLoading,
    onClose,
    onResultClick,
    onSetTypeFilter,
    onTypeFilterChange,
    onVisibleResultCountChange,
    results,
    searchQuery,
    typeFilter,
  }) => {
    const { t } = useTranslation('common');
    const navigate = useWorkspaceAwareNavigate();

    const handleNavigate = (result: CommandMenuSearchResult, position: number) => {
      onResultClick({ position, resultType: result.type });
      switch (result.type) {
        case 'task': {
          navigate(taskDetailPath(result.id, undefined, result.title));
          break;
        }
        case 'team': {
          navigate(`/teams/${result.id}`);
          break;
        }
        case 'project': {
          navigate(`/project/${result.id}`);
          break;
        }
        case 'savedView': {
          navigate(`/views/${result.id}`);
          break;
        }
        case 'agent': {
          navigate(`/agent/${result.id}?agent=${result.id}`);
          break;
        }
        case 'chatGroup': {
          navigate(`/group/${result.id}`);
          break;
        }
        case 'topic': {
          if (result.agentId) {
            navigate(AGENT_CHAT_TOPIC_URL(result.agentId, result.id));
          } else if (result.groupId) {
            navigate(GROUP_CHAT_TOPIC_URL(result.groupId, result.id));
          } else {
            navigate('/');
          }
          break;
        }
        case 'message': {
          // Navigate to the topic/agent (or group) where the message lives
          if (result.topicId && result.agentId) {
            navigate(`${AGENT_CHAT_TOPIC_URL(result.agentId, result.topicId)}#${result.id}`);
          } else if (result.topicId && result.groupId) {
            navigate(`${GROUP_CHAT_TOPIC_URL(result.groupId, result.topicId)}#${result.id}`);
          } else if (result.agentId) {
            navigate(`/agent/${result.agentId}#${result.id}`);
          } else if (result.groupId) {
            navigate(`${GROUP_CHAT_URL(result.groupId)}#${result.id}`);
          } else {
            navigate('/');
          }
          break;
        }
        case 'file': {
          // Navigate to resource library with file parameter
          const fileUrl = result.knowledgeBaseId
            ? `/resource/library/${result.knowledgeBaseId}?file=${result.id}`
            : `/resource?file=${result.id}`;
          console.info('[SearchResults] File navigation:', {
            fileDetails: result,
            url: fileUrl,
          });
          navigate(fileUrl);
          break;
        }
        case 'page': {
          navigate(`/resource?file=${result.id}`);
          break;
        }
        case 'folder': {
          // Navigate to folder by slug
          if (result.knowledgeBaseId && result.slug) {
            navigate(`/resource/library/${result.knowledgeBaseId}/${result.slug}`);
          } else if (result.slug) {
            navigate(`/resource/library/${result.slug}`);
          } else {
            // Fallback to library root if no slug
            navigate(`/resource/library`);
          }
          break;
        }
        case 'memory': {
          navigate(`/memory/preferences?preferenceId=${result.id}`);
          break;
        }
        case 'knowledgeBase': {
          navigate(`/resource/library/${result.id}`);
          break;
        }
      }
      onClose();
    };

    const getIcon = (type: CommandMenuSearchResult['type']) => {
      switch (type) {
        case 'task': {
          return <ListTodo size={16} />;
        }
        case 'team': {
          return <Users size={16} />;
        }
        case 'project': {
          return <PROJECT_ENTITY_ICON size={16} />;
        }
        case 'savedView': {
          return <Filter size={16} />;
        }
        case 'agent': {
          return <Sparkles size={16} />;
        }
        case 'chatGroup': {
          return <Users size={16} />;
        }
        case 'topic': {
          return <MessageSquare size={16} />;
        }
        case 'message': {
          return <MessageCircle size={16} />;
        }
        case 'file': {
          return <FileText size={16} />;
        }
        case 'page': {
          return <FileText size={16} />;
        }
        case 'folder': {
          return <Folder size={16} />;
        }
        case 'memory': {
          return <Brain size={16} />;
        }
        case 'knowledgeBase': {
          return <Library size={16} />;
        }
      }
    };

    const getTypeLabel = (type: CommandMenuSearchResult['type']) => {
      switch (type) {
        case 'page':
        case 'pageContent': {
          return t('cmdk.search.page');
        }
        default: {
          return t(`cmdk.search.${type}`);
        }
      }
    };

    // Group headings are plural ("Tasks", "Projects"…) — Linear-style labeled
    // sections. Every renderable type has a `cmdk.search.<type>s` key; the
    // singular label is the fallback for any type that slips through.
    const getGroupHeading = (type: string) =>
      t(`cmdk.search.${type}s` as any, { defaultValue: getTypeLabel(type as any) });

    const resultTitle = (result: CommandMenuSearchResult) =>
      result.type === 'savedView' ? savedViewTitle(result.id, result.title, t) : result.title;

    const getItemValue = (result: CommandMenuSearchResult) => {
      const meta = [resultTitle(result), result.description].filter(Boolean).join(' ');
      return `search-result ${result.type} ${result.id} ${meta}`.trim();
    };

    const getDescription = (result: CommandMenuSearchResult) => {
      if (!result.description) return null;
      if (result.type === 'message') {
        return markdownToTxt(result.description);
      }
      return result.description;
    };

    const getSubtitle = (result: CommandMenuSearchResult): ReactNode => {
      const description = getDescription(result);

      // Topic results: prefix with agent identity (avatar + title) so users can
      // distinguish topics with the same name (e.g. customer email) across agents.
      if (result.type === 'topic') {
        const formattedDate = dayjs(result.createdAt).format('MMM D, YYYY');
        if (!result.agent) {
          return description ? `${description} · ${formattedDate}` : formattedDate;
        }
        return (
          <Flexbox horizontal align="center" gap={6} style={{ minWidth: 0 }}>
            <Avatar
              avatar={result.agent.avatar || DEFAULT_AVATAR}
              background={result.agent.backgroundColor || undefined}
              name={agentDisplayName(result.agent, t('defaultAgent'))}
              size={14}
            />
            <span style={{ flex: 'none' }}>
              {agentDisplayName(result.agent, t('defaultAgent'))}
            </span>
            <span style={{ flex: 'none' }}>·</span>
            <span style={{ flex: 'none' }}>{formattedDate}</span>
            {description && (
              <>
                <span style={{ flex: 'none' }}>·</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {description}
                </span>
              </>
            )}
          </Flexbox>
        );
      }

      // For message results, append creation date
      if (result.type === 'message') {
        const formattedDate = dayjs(result.createdAt).format('MMM D, YYYY');
        if (description) {
          return `${description} · ${formattedDate}`;
        }
        return formattedDate;
      }

      return description;
    };

    const handleSearchMore = (type: ValidSearchType) => {
      onTypeFilterChange();
      onSetTypeFilter(type);
    };

    const groups = groupSearchResults(results);
    const hasResults = groups.length > 0;
    const visibleResultPositions = createVisibleResultPositionMap<CommandMenuSearchResult>(
      groups.map((group) => group.items),
      0,
    );
    const visibleResultCount = visibleResultPositions.size;

    useLayoutEffect(() => {
      onVisibleResultCountChange(visibleResultCount);
    }, [onVisibleResultCountChange, visibleResultCount]);

    // Don't render anything if no supported results and not loading.
    if (!hasResults && !isLoading && typeFilter) {
      return null;
    }

    // Render a single result item. The group heading already names the type,
    // so the title needs no inline "Type ›" prefix.
    const renderResultItem = (result: CommandMenuSearchResult) => {
      const subtitle = getSubtitle(result);

      return (
        <CommandItem
          forceMount
          description={subtitle}
          icon={getIcon(result.type)}
          key={result.id}
          title={resultTitle(result)}
          value={getItemValue(result)}
          variant="detailed"
          onSelect={() => handleNavigate(result, visibleResultPositions.get(result) ?? 1)}
        />
      );
    };

    // Helper to render "Search More" button
    const renderSearchMore = (type: ValidSearchType, count: number) => {
      // Don't show if already filtering by this type
      if (typeFilter) return null;

      if (count === 0) return null;

      const typeLabel = getTypeLabel(type);
      const titleText = `${t('cmdk.search.searchMore', { type: typeLabel })} with "${searchQuery}"`;

      return (
        <Command.Item
          forceMount
          key={`search-more-${type}`}
          keywords={[`zzz-action-${type}`]}
          value={`zzz-action-${type}-search-more`}
          onSelect={() => handleSearchMore(type)}
        >
          <div className={styles.itemContent}>
            <div className={styles.itemIcon}>{getIcon(type)}</div>
            <div className={styles.itemDetails}>
              <div className={styles.itemTitle}>{titleText}</div>
            </div>
          </div>
        </Command.Item>
      );
    };

    return (
      <>
        {/* Search results grouped under labeled section headings (Linear-style):
            the heading names the result type, items keep server rank order. */}
        {groups.map(({ items, type }) => (
          <Command.Group forceMount heading={getGroupHeading(type)} key={type}>
            {items.map((result) => renderResultItem(result))}
            {/* `page` renders as a group but is not a `type:` filter target,
                so it gets no "search more" drill-in. */}
            {isValidSearchType(type) && renderSearchMore(type, items.length)}
          </Command.Group>
        ))}

        {/* Show loading skeleton below existing results */}
        {isLoading && (
          <Command.Group forceMount>
            {[1, 2, 3].map((i) => (
              <Command.Item
                disabled
                key={`skeleton-${i}`}
                keywords={[searchQuery]}
                value={`${searchQuery}-loading-skeleton-${i}`}
              >
                <div className={styles.skeleton} style={{ height: 20, width: 20 }} />
                <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 4 }}>
                  <div className={styles.skeleton} style={{ width: `${60 + i * 10}%` }} />
                  <div
                    className={styles.skeleton}
                    style={{ height: 12, width: `${40 + i * 5}%` }}
                  />
                </div>
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </>
    );
  },
);

SearchResults.displayName = 'SearchResults';

export default SearchResults;
