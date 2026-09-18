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
  ChevronRight,
  FileText,
  Filter,
  Folder,
  FolderKanban,
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
import { savedViewTitle } from '@/features/SavedViews/savedViewTitle';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { markdownToTxt } from '@/utils/markdownToTxt';

import type { CommandMenuResultClick } from './analytics';
import { CommandItem } from './components';
import { styles } from './styles';
import { type CommandMenuWorkType, type ValidSearchType } from './utils/queryParser';
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
          return <FolderKanban size={16} />;
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
        case 'page': {
          return t('cmdk.search.file');
        }
        default: {
          return t(`cmdk.search.${type}`);
        }
      }
    };

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

    const availableResults = results.filter(
      (result) => !['mcp', 'plugin', 'communityAgent'].includes(result.type),
    );
    const hasResults = availableResults.length > 0;

    // Group results by type
    const taskResults = availableResults.filter((r) => r.type === 'task');
    const teamResults = availableResults.filter((r) => r.type === 'team');
    const projectResults = availableResults.filter((r) => r.type === 'project');
    const savedViewResults = availableResults.filter((r) => r.type === 'savedView');
    const messageResults = availableResults.filter((r) => r.type === 'message');
    const chatGroupResults = availableResults.filter((r) => r.type === 'chatGroup');
    const agentResults = availableResults.filter((r) => r.type === 'agent');
    const topicResults = availableResults.filter((r) => r.type === 'topic');
    const fileResults = availableResults.filter((r) => r.type === 'file');
    const pageResults = availableResults.filter((r) => r.type === 'page');
    const folderResults = availableResults.filter((r) => r.type === 'folder');
    const memoryResults = availableResults.filter((r) => r.type === 'memory');
    const knowledgeBaseResults = availableResults.filter((r) => r.type === 'knowledgeBase');
    const visibleResultPositions = createVisibleResultPositionMap<CommandMenuSearchResult>(
      [
        taskResults,
        teamResults,
        projectResults,
        savedViewResults,
        messageResults,
        agentResults,
        chatGroupResults,
        topicResults,
        memoryResults,
        fileResults,
        pageResults,
        folderResults,
        knowledgeBaseResults,
      ],
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

    // Render a single result item with type prefix (like "Message > content")
    const renderResultItem = (result: CommandMenuSearchResult) => {
      const typeLabel = getTypeLabel(result.type);
      const subtitle = getSubtitle(result);
      const title = resultTitle(result);

      // Hide type prefix when filtering by specific type
      const showTypePrefix = !typeFilter;

      // Create title with or without type prefix
      const titleWithPrefix = showTypePrefix ? (
        <>
          <span style={{ opacity: 0.5 }}>{typeLabel}</span>
          <ChevronRight
            size={14}
            style={{
              display: 'inline',
              marginInline: '6px',
              opacity: 0.5,
              verticalAlign: 'middle',
            }}
          />
          {title}
        </>
      ) : (
        title
      );

      return (
        <CommandItem
          forceMount
          description={subtitle}
          icon={getIcon(result.type)}
          key={result.id}
          title={titleWithPrefix}
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
        {/* Render search results grouped by type without headers */}
        {taskResults.length > 0 && (
          <Command.Group forceMount>
            {taskResults.map((result) => renderResultItem(result))}
            {renderSearchMore('task', taskResults.length)}
          </Command.Group>
        )}

        {teamResults.length > 0 && (
          <Command.Group forceMount>
            {teamResults.map((result) => renderResultItem(result))}
            {renderSearchMore('team', teamResults.length)}
          </Command.Group>
        )}

        {projectResults.length > 0 && (
          <Command.Group forceMount>
            {projectResults.map((result) => renderResultItem(result))}
            {renderSearchMore('project', projectResults.length)}
          </Command.Group>
        )}

        {savedViewResults.length > 0 && (
          <Command.Group forceMount>
            {savedViewResults.map((result) => renderResultItem(result))}
            {renderSearchMore('savedView', savedViewResults.length)}
          </Command.Group>
        )}

        {messageResults.length > 0 && (
          <Command.Group forceMount>
            {messageResults.map((result) => renderResultItem(result))}
            {renderSearchMore('message', messageResults.length)}
          </Command.Group>
        )}

        {agentResults.length > 0 && (
          <Command.Group forceMount>
            {agentResults.map((result) => renderResultItem(result))}
            {renderSearchMore('agent', agentResults.length)}
          </Command.Group>
        )}

        {chatGroupResults.length > 0 && (
          <Command.Group forceMount>
            {chatGroupResults.map((result) => renderResultItem(result))}
            {renderSearchMore('chatGroup', chatGroupResults.length)}
          </Command.Group>
        )}

        {topicResults.length > 0 && (
          <Command.Group forceMount>
            {topicResults.map((result) => renderResultItem(result))}
            {renderSearchMore('topic', topicResults.length)}
          </Command.Group>
        )}

        {memoryResults.length > 0 && (
          <Command.Group forceMount>
            {memoryResults.map((result) => renderResultItem(result))}
            {renderSearchMore('memory', memoryResults.length)}
          </Command.Group>
        )}

        {fileResults.length > 0 && (
          <Command.Group forceMount>
            {fileResults.map((result) => renderResultItem(result))}
            {renderSearchMore('file', fileResults.length)}
          </Command.Group>
        )}

        {pageResults.length > 0 && (
          <Command.Group forceMount>
            {pageResults.map((result) => renderResultItem(result))}
          </Command.Group>
        )}

        {folderResults.length > 0 && (
          <Command.Group forceMount>
            {folderResults.map((result) => renderResultItem(result))}
            {renderSearchMore('folder', folderResults.length)}
          </Command.Group>
        )}

        {knowledgeBaseResults.length > 0 && (
          <Command.Group forceMount>
            {knowledgeBaseResults.map((result) => renderResultItem(result))}
            {renderSearchMore('knowledgeBase', knowledgeBaseResults.length)}
          </Command.Group>
        )}

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
