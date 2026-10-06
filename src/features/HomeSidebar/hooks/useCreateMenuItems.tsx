import { CHAT_NEW_URL } from '@orvilo/const';
import type { SFSymbol } from '@orvilo/electron-client-ipc';
import type { HeterogeneousAgentType } from '@orvilo/heterogeneous-agents';
import { BotIcon, FolderCogIcon, ListPlusIcon, MessageSquarePlus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/toast';
import { openConnectAgentModal } from '@/features/ConnectAgent';
import { openNewConversation } from '@/features/Conversation/selectAgent';
import type { SidebarMenuItemData } from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { useHomeStore } from '@/store/home';

const stopMenuItemDomEvent = (domEvent: unknown) => {
  if (
    typeof domEvent === 'object' &&
    domEvent !== null &&
    'stopPropagation' in domEvent &&
    typeof domEvent.stopPropagation === 'function'
  ) {
    domEvent.stopPropagation();
  }
};

type MenuItem = SidebarMenuItemData & { sfSymbol?: SFSymbol };

interface CreateAgentOptions {
  groupId?: string;
  initialType?: HeterogeneousAgentType;
  isPinned?: boolean;
  onSuccess?: () => void;
  /**
   * Which surface the create entry lives on. The contract fixes the
   * destination by origin: a chat-surface entry opens a blank conversation
   * with the new agent selected; a settings entry stays in the new agent's
   * settings without touching the chat default. Default `chat` — the
   * sidebar menus are conversation chrome.
   */
  origin?: 'chat' | 'settings';
  /**
   * Forwarded to the server-side `visibility` column. Used by the sidebar's
   * "Create Private …" entries; defaults to `'private'` so personal execution is valid. Has no effect in personal mode.
   */
  visibility?: 'private' | 'public';
}

/**
 * Hook for generating menu items for top-level create actions
 * Used by the home sidebar create menus.
 */
export const useCreateMenuItems = () => {
  const { t } = useTranslation(['chat', 'common']);
  const navigate = useWorkspaceAwareNavigate();
  const { allowed: canCreate } = usePermission('create_content');

  const [refreshAgentList, removeAgent] = useHomeStore((s) => [s.refreshAgentList, s.removeAgent]);

  const [isMutatingAgent, setIsMutatingAgent] = useState(false);

  const createAgent = useCallback(
    async (options?: CreateAgentOptions) => {
      if (!canCreate) return;
      openConnectAgentModal({
        groupId: options?.groupId,
        initialType: options?.initialType,
        visibility: options?.visibility ?? 'private',
        onCreated: async (agentId, config) => {
          setIsMutatingAgent(true);
          try {
            await refreshAgentList();
            toast.success({
              actions: [{ label: t('common:undo'), onClick: () => void removeAgent(agentId) }],
              title: t('agentCreated', { name: config?.name || config?.title || 'Orvilo AI' }),
            });
            if (options?.origin === 'settings') {
              navigate(`/settings/agents/${agentId}`);
            } else {
              openNewConversation({ agentId });
            }
            options?.onSuccess?.();
          } finally {
            setIsMutatingAgent(false);
          }
        },
      });
    },
    [canCreate, navigate, refreshAgentList, removeAgent, t],
  );

  /**
   * Create agent menu item
   */
  const createAgentMenuItem = useCallback(
    (options?: CreateAgentOptions): MenuItem => ({
      icon: <BotIcon size={14} />,
      disabled: !canCreate,
      // Key needs to vary by visibility so the public and private "New
      // Agent" entries can coexist (e.g. if a future menu lists both).
      key: options?.visibility === 'private' ? 'newPrivateAgent' : 'newAgent',
      label: t('newAgent'),
      sfSymbol: 'plus.bubble',
      onClick: async (info) => {
        stopMenuItemDomEvent(info.domEvent);
        if (!canCreate) return;
        await createAgent(options);
      },
    }),
    [canCreate, t, createAgent],
  );

  /**
   * Open the complete Agent list, where shared Agents can be added to the
   * caller's sidebar without mutating the Agent itself.
   */
  const createAgentListMenuItem = useCallback(
    (options?: { visibility?: 'private' | 'public' }): MenuItem => ({
      icon: <ListPlusIcon size={14} />,
      key: options?.visibility === 'private' ? 'addPrivateAgentFromList' : 'addAgentFromList',
      label: t('addAgentFromList'),
      sfSymbol: 'list.bullet',
      onClick: (info) => {
        stopMenuItemDomEvent(info.domEvent);
        // Land the view-all page on the tab matching the caller's bucket.
        navigate(options?.visibility === 'private' ? '/agents?tab=private' : '/agents');
      },
    }),
    [navigate, t],
  );

  /**
   * Connect Agent menu item — the unified device-first wizard for external
   * agents installed on a local or connected machine.
   */
  const createConnectAgentMenuItem = useCallback(
    (_options?: CreateAgentOptions): MenuItem | null => null,
    [],
  );

  /**
   * Config menu item
   */
  const configMenuItem = useCallback(
    (onOpenConfig: () => void): MenuItem => ({
      icon: <FolderCogIcon size={14} />,
      key: 'config',
      label: t('sessionGroup.manageCategory'),
      sfSymbol: 'folder.badge.gearshape',
      onClick: (info) => {
        stopMenuItemDomEvent(info.domEvent);
        onOpenConfig();
      },
    }),
    [t],
  );

  /**
   * Top-level create menu shown by the Agent section and header add buttons.
   */
  const createConversationMenuItem = useCallback(
    (): MenuItem => ({
      icon: <MessageSquarePlus size={14} />,
      key: 'newConversation',
      label: t('common:cmdk.newConversation'),
      onClick: () => navigate(CHAT_NEW_URL),
    }),
    [navigate, t],
  );

  const createTopLevelMenuItems = useCallback(
    (): MenuItem[] => [
      createConversationMenuItem(),
      { type: 'divider' as const },
      createAgentMenuItem(),
      { type: 'divider' as const },
    ],
    [createConversationMenuItem, createAgentMenuItem],
  );

  return {
    configMenuItem,
    createAgent,
    createAgentListMenuItem,
    createAgentMenuItem,
    createConnectAgentMenuItem,
    createConversationMenuItem,
    createTopLevelMenuItems,

    // Loading states
    isLoading: isMutatingAgent,
    isMutatingAgent,
  };
};
