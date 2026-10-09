import { useDebounce } from 'ahooks';
import { useTheme as useNextThemesTheme } from 'next-themes';
import { useCallback, useEffect } from 'react';
import useSWR from 'swr';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { isDesktop } from '@/const/version';
import { createTaskModal } from '@/features/AgentTasks/CreateTaskModal';
import { useCreateNewModal } from '@/features/LibraryModal';
import { openCreateProjectModal } from '@/features/Projects/CreateProjectModal';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { lambdaClient } from '@/libs/trpc/client';
import { getHostPort } from '@/platform';
import { omitPersonalTeamItems } from '@/services/recent';
import { workAttentionService } from '@/services/workAttention';
import { useAgentStore } from '@/store/agent';
import { builtinAgentSelectors } from '@/store/agent/selectors/builtinAgentSelectors';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';
import { useGlobalStore } from '@/store/global';
import { globalHelpers } from '@/store/global/helpers';

import { useCommandMenuContext } from './CommandMenuContext';
import { type CommandMenuSearchResult, type ThemeMode } from './types';
import { isCommandMenuFtsType, isCommandMenuWorkType } from './utils/queryParser';

/** Mixed palette stays small; a typed filter may request up to 50 of that type. */
const COMMAND_MENU_MIXED_LIMIT_PER_TYPE = 5;
const COMMAND_MENU_TYPED_LIMIT_PER_TYPE = 50;

/**
 * Shared methods for CommandMenu
 */
export const useCommandMenu = () => {
  const [open] = useGlobalStore((s) => [s.status.showCommandMenu]);
  const {
    mounted,
    onClose,
    search,
    setSearch,
    pages,
    popPage,
    typeFilter,
    setTypeFilter,
    page,
    pathname,
    selectedAgent,
    setSelectedAgent,
    activeAgentId: agentId,
  } = useCommandMenuContext();

  const navigate = useWorkspaceAwareNavigate();
  const workspaceId = useActiveWorkspaceId();
  const { allowed: canCreate } = usePermission('create_content');
  const { setTheme } = useNextThemesTheme();
  const inboxAgentId = useAgentStore(builtinAgentSelectors.inboxAgentId);
  const { open: openCreateLibraryModal } = useCreateNewModal();

  // Debounce search input to reduce API calls
  const debouncedSearch = useDebounce(search, { wait: 600 });

  // Search functionality
  const hasSearch = debouncedSearch.trim().length > 0;
  const searchQuery = debouncedSearch.trim();

  const {
    data: searchResults,
    error: searchError,
    isLoading: isSearching,
    isValidating: isSearchValidating,
  } = useSWR<CommandMenuSearchResult[]>(
    hasSearch ? ['search', searchQuery, agentId, typeFilter, workspaceId] : null,
    async () => {
      const locale = globalHelpers.getCurrentLanguage();
      const limitPerType = typeFilter
        ? COMMAND_MENU_TYPED_LIMIT_PER_TYPE
        : COMMAND_MENU_MIXED_LIMIT_PER_TYPE;
      const ftsType = isCommandMenuFtsType(typeFilter) ? typeFilter : undefined;
      const wantsFts = !typeFilter || Boolean(ftsType);
      const wantsWork =
        (!typeFilter || isCommandMenuWorkType(typeFilter)) &&
        (Boolean(workspaceId) || typeFilter !== 'team');
      const [fts, work] = await Promise.all([
        wantsFts
          ? lambdaClient.search.query.query({
              agentId,
              includeMarketplace: false,
              limitPerType,
              locale,
              query: searchQuery,
              type: ftsType,
            })
          : Promise.resolve([]),
        wantsWork
          ? workAttentionService
              .search({
                limitPerType,
                query: searchQuery,
                type: isCommandMenuWorkType(typeFilter) ? typeFilter : undefined,
              })
              .then((response) => omitPersonalTeamItems(response.data, workspaceId))
              .catch((error: unknown) => {
                console.error('[commandMenu.workSearch]', error);
                return [];
              })
          : Promise.resolve([]),
      ]);
      return [...work, ...fts] as CommandMenuSearchResult[];
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  // Close on Escape key and prevent body scroll
  useEffect(() => {
    if (open) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [open]);

  const closeCommandMenu = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleNavigate = useCallback(
    (path: string) => {
      navigate(path);
      onClose();
    },
    [navigate, onClose],
  );

  const handleExternalLink = useCallback(
    async (url: string) => {
      if (isDesktop) {
        await getHostPort().openExternal(url);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      onClose();
    },
    [onClose],
  );

  const handleThemeChange = useCallback(
    (theme: ThemeMode) => {
      setTheme(theme);
      onClose();
    },
    [setTheme, onClose],
  );

  const handleAskOrviloAI = useCallback(() => {
    // Navigate to inbox agent with the message query parameter
    if (inboxAgentId && search.trim()) {
      const message = encodeURIComponent(search.trim());
      navigate(`/agent/${inboxAgentId}?message=${message}`);
      onClose();
    }
  }, [inboxAgentId, search, navigate, onClose]);

  const handleBack = useCallback(() => {
    popPage();
  }, [popPage]);

  const handleSendToSelectedAgent = useCallback(() => {
    if (selectedAgent && search.trim()) {
      const message = encodeURIComponent(search.trim());
      navigate(`/agent/${selectedAgent.id}?message=${message}`);
      setSelectedAgent(undefined);
      onClose();
    }
  }, [selectedAgent, search, navigate, setSelectedAgent, onClose]);

  const openNewTopicOrSaveTopic = useChatStore((s) => s.openNewTopicOrSaveTopic);

  const handleCreateTopic = useCallback(() => {
    if (!canCreate) return;
    // The command item is disabled while a new-topic send is in flight, but a
    // selection can still race the window opening — don't close the palette on
    // what would be a silent no-op in openNewTopicOrSaveTopic.
    if (topicSelectors.isNewTopicSendInFlight(useChatStore.getState())) return;

    openNewTopicOrSaveTopic();
    onClose();
  }, [canCreate, openNewTopicOrSaveTopic, onClose]);

  const handleCreateLibrary = useCallback(() => {
    if (!canCreate) return;

    onClose();
    openCreateLibraryModal({
      onSuccess: (id) => {
        navigate(`/resource/library/${id}`);
      },
    });
  }, [canCreate, onClose, openCreateLibraryModal, navigate]);

  const handleCreateTask = useCallback(() => {
    if (!canCreate) return;

    navigate('/tasks');
    onClose();
    createTaskModal();
  }, [canCreate, navigate, onClose]);

  const handleCreateProject = useCallback(() => {
    if (!canCreate) return;

    // Close the palette first — same pattern as the feedback entry in MainMenu:
    // the modal mounts outside the palette and the overlay must not linger.
    onClose();
    openCreateProjectModal();
  }, [canCreate, onClose]);

  const handleCreateConversation = useCallback(() => {
    if (!canCreate || topicSelectors.isNewTopicSendInFlight(useChatStore.getState())) return;
    onClose();
    navigate('/chat/new');
  }, [canCreate, onClose, navigate]);

  return {
    closeCommandMenu,
    handleAskOrviloAI,
    handleBack,
    handleCreateConversation,
    handleCreateLibrary,
    handleCreateProject,
    handleCreateTask,
    handleCreateTopic,
    handleExternalLink,
    handleNavigate,
    handleSendToSelectedAgent,
    handleThemeChange,
    hasSearch,
    hasSearchResponse: searchResults !== undefined,
    isSearching,
    isSearchValidating,
    mounted,
    open,
    page,
    pages,
    pathname,
    search,
    searchError,
    searchQuery,
    searchResults: searchResults || ([] as CommandMenuSearchResult[]),
    selectedAgent,
    setSearch,
    setSelectedAgent,
    setTypeFilter,
    typeFilter,
  };
};
