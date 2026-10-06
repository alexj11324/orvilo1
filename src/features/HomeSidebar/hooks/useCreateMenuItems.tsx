import { GroupBotSquareIcon } from '@lobehub/ui/icons';
import { CHAT_NEW_URL } from '@orvilo/const';
import type { SFSymbol } from '@orvilo/electron-client-ipc';
import type { HeterogeneousAgentType } from '@orvilo/heterogeneous-agents';
import {
  BotIcon,
  FolderCogIcon,
  FolderPlus,
  ListPlusIcon,
  MessageSquarePlus,
  SparklesIcon,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useGroupTemplates } from '@/components/ChatGroupWizard/templates';
import { toast } from '@/components/toast';
import { DEFAULT_CHAT_GROUP_CHAT_CONFIG } from '@/const/settings';
import { openConnectAgentModal } from '@/features/ConnectAgent';
import { openNewConversation } from '@/features/Conversation/selectAgent';
import { requestAgentRuntime } from '@/features/CreateAgent';
import { openCreateGroupChatModal } from '@/features/CreateGroupChat';
import { useOptionalAgentModal } from '@/features/HomeSidebar/Body/Agent/ModalProvider';
import type { SidebarMenuItemData } from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import type { GroupMemberConfig } from '@/services/chatGroup';
import { chatGroupService } from '@/services/chatGroup';
import { useAgentGroupStore } from '@/store/agentGroup';
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
  const groupTemplates = useGroupTemplates();
  const { allowed: canCreate } = usePermission('create_content');

  const [addGroup, refreshAgentList, switchToGroup, removeAgent] = useHomeStore((s) => [
    s.addGroup,
    s.refreshAgentList,
    s.switchToGroup,
    s.removeAgent,
  ]);
  const privateGroups = useHomeStore((s) => s.privateAgentGroups);
  const [createGroup, loadGroups] = useAgentGroupStore((s) => [s.createGroup, s.loadGroups]);

  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isCreatingSessionGroup, setIsCreatingSessionGroup] = useState(false);
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
   * Create group from template
   * Uses backend batch creation for better performance and consistency
   */
  const createGroupFromTemplate = useCallback(
    async (templateId: string, selectedMemberTitles?: string[], options?: CreateAgentOptions) => {
      if (!canCreate) return false;

      setIsCreatingGroup(true);
      try {
        const template = groupTemplates.find((t) => t.id === templateId);
        if (!template) {
          throw new Error(`Template ${templateId} not found`);
        }

        const membersToCreate =
          typeof selectedMemberTitles === 'undefined'
            ? template.members
            : template.members.filter((m) => selectedMemberTitles.includes(m.title));

        const visibility = options?.groupId
          ? privateGroups.some((group) => group.id === options.groupId)
            ? 'private'
            : 'public'
          : (options?.visibility ?? 'private');
        const runtimeConfig = await requestAgentRuntime({ visibility });
        if (!runtimeConfig) return false;

        // Prepare member configs for batch creation
        const memberConfigs: GroupMemberConfig[] = membersToCreate.map((member) => ({
          ...runtimeConfig,
          avatar: member.avatar,
          backgroundColor: member.backgroundColor,
          plugins: member.plugins,
          systemRole: member.systemRole,
          title: member.title,
        }));

        // Use batch creation endpoint - creates all agents and group in one request
        const { groupId } = await chatGroupService.createGroupWithMembers(
          {
            title: template.title,
            groupId: options?.groupId,
            visibility,
          },
          memberConfigs,
        );

        // Switch to the new group
        switchToGroup(groupId);

        // Refresh data after creation
        await refreshAgentList();
        await loadGroups();

        return true;
      } catch (error) {
        console.error('Failed to create group from template:', error);
        toast.error(t('sessionGroup.createGroupFailed'));
        return false;
      } finally {
        setIsCreatingGroup(false);
      }
    },
    [canCreate, groupTemplates, refreshAgentList, loadGroups, switchToGroup, privateGroups, t],
  );

  /**
   * Create group with members
   */
  const createGroupWithMembers = useCallback(
    async (selectedAgents: string[], groupTitle?: string) => {
      if (!canCreate) return false;

      setIsCreatingGroup(true);
      try {
        const title = groupTitle || t('defaultGroupChat');

        await createGroup(
          {
            config: DEFAULT_CHAT_GROUP_CHAT_CONFIG,
            title,
          },
          selectedAgents,
        );

        return true;
      } catch (error) {
        console.error('Failed to create group:', error);
        toast.error(t('sessionGroup.createGroupFailed'));
        return false;
      } finally {
        setIsCreatingGroup(false);
      }
    },
    [canCreate, createGroup, t],
  );

  const agentModal = useOptionalAgentModal();
  const openCreateModal = agentModal?.openCreateModal;
  const openCreateGroupModal = agentModal?.openCreateGroupModal;

  const createEmptyGroup = useCallback(
    async (options?: CreateAgentOptions & { title?: string }) => {
      if (!canCreate) return;
      openCreateGroupChatModal({
        groupId: options?.groupId,
        visibility: options?.visibility ?? 'private',
        onGenerate: openCreateModal
          ? (context) => openCreateModal('group', { ...options, ...context })
          : undefined,
      });
    },
    [canCreate, openCreateModal],
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
   * Create group chat menu item
   * Primary flow: create a generic group room immediately — no purpose prompt —
   * and land in its conversation.
   */
  const createGroupChatMenuItem = useCallback(
    (options?: CreateAgentOptions): MenuItem => ({
      icon: <GroupBotSquareIcon size={14} />,
      disabled: !canCreate,
      key: options?.visibility === 'private' ? 'newPrivateGroupChat' : 'newGroupChat',
      label: t('newGroupChat'),
      sfSymbol: 'person.2',
      onClick: async (info) => {
        stopMenuItemDomEvent(info.domEvent);
        if (!canCreate) return;

        await createEmptyGroup(options);
      },
    }),
    [canCreate, t, createEmptyGroup],
  );

  /**
   * Optional secondary affordance: generate the group from a written description
   * (the create modal's purpose prompt, which still runs the builder flow).
   * Only offered where the create modal can actually open.
   */
  const createGroupFromDescriptionMenuItem = useCallback(
    (options?: CreateAgentOptions): MenuItem | null => {
      if (!openCreateModal) return null;
      return {
        icon: <SparklesIcon size={14} />,
        disabled: !canCreate,
        key: 'newGroupChatFromDescription',
        label: t('newGroupChatFromDescription'),
        sfSymbol: 'sparkles',
        onClick: (info) => {
          stopMenuItemDomEvent(info.domEvent);
          if (!canCreate) return;

          openCreateModal('group', {
            ...(options?.groupId ? { groupId: options.groupId } : {}),
            ...(options?.visibility ? { visibility: options.visibility } : {}),
          });
        },
      };
    },
    [canCreate, t, openCreateModal],
  );

  /**
   * Add session group menu item
   */
  const createSessionGroupMenuItem = useCallback(
    (options?: { visibility?: 'private' | 'public' }): MenuItem => ({
      icon: <FolderPlus size={14} />,
      disabled: !canCreate,
      key: options?.visibility === 'private' ? 'addPrivateSessionGroup' : 'addSessionGroup',
      label: t('sessionGroup.createGroup'),
      sfSymbol: 'folder.badge.plus',
      onClick: async (info) => {
        stopMenuItemDomEvent(info.domEvent);
        if (!canCreate) return;

        if (openCreateGroupModal) {
          // Let the user name the group at creation time
          openCreateGroupModal(undefined, options?.visibility);
          return;
        }

        setIsCreatingSessionGroup(true);
        await addGroup(t('sessionGroup.newGroup'), options?.visibility);
        setIsCreatingSessionGroup(false);
      },
    }),
    [canCreate, t, addGroup, openCreateGroupModal],
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
      createGroupChatMenuItem(),
      { type: 'divider' as const },
      createAgentMenuItem(),
      { type: 'divider' as const },
    ],
    [createConversationMenuItem, createGroupChatMenuItem, createAgentMenuItem],
  );

  return {
    configMenuItem,
    createAgent,
    createAgentListMenuItem,
    createAgentMenuItem,
    createConnectAgentMenuItem,
    createConversationMenuItem,
    createEmptyGroup,
    createGroupChatMenuItem,
    createGroupFromDescriptionMenuItem,
    createGroupFromTemplate,
    createGroupWithMembers,
    createSessionGroupMenuItem,
    createTopLevelMenuItems,
    openCreateModal,

    // Loading states
    isCreatingGroup,
    isCreatingSessionGroup,
    isLoading: isMutatingAgent || isCreatingGroup || isCreatingSessionGroup,
    isMutatingAgent,
  };
};
