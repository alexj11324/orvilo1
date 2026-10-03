import { GroupBotSquareIcon } from '@lobehub/ui/icons';
import type { SFSymbol } from '@orvilo/electron-client-ipc';
import {
  BotIcon,
  FolderCogIcon,
  FolderPlus,
  ListPlusIcon,
  MonitorSmartphone,
  SparklesIcon,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWRMutation from 'swr/mutation';

import { useGroupTemplates } from '@/components/ChatGroupWizard/templates';
import { toast } from '@/components/toast';
import { DEFAULT_CHAT_GROUP_CHAT_CONFIG } from '@/const/settings';
import { openConnectAgentModal } from '@/features/ConnectAgent';
import { openNewConversation } from '@/features/Conversation/selectAgent';
import { useOptionalAgentModal } from '@/features/HomeSidebar/Body/Agent/ModalProvider';
import type { SidebarMenuItemData } from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import type { CreateAgentParams } from '@/services/agent';
import type { GroupMemberConfig } from '@/services/chatGroup';
import { chatGroupService } from '@/services/chatGroup';
import { useAgentStore } from '@/store/agent';
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
   * "Create Private …" entries; defaults to undefined which the server reads
   * as `'public'`. Has no effect in personal mode.
   */
  visibility?: 'private' | 'public';
}

/**
 * Hook for generating menu items for top-level create actions
 * Used by the home sidebar create menus.
 */
export const useCreateMenuItems = () => {
  const { t } = useTranslation('chat');
  const navigate = useWorkspaceAwareNavigate();
  const groupTemplates = useGroupTemplates();
  const { allowed: canCreate } = usePermission('create_content');

  const [storeCreateAgent] = useAgentStore((s) => [s.createAgent]);
  const [addGroup, refreshAgentList, switchToGroup] = useHomeStore((s) => [
    s.addGroup,
    s.refreshAgentList,
    s.switchToGroup,
  ]);
  const [createGroup, loadGroups] = useAgentGroupStore((s) => [s.createGroup, s.loadGroups]);

  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isCreatingSessionGroup, setIsCreatingSessionGroup] = useState(false);

  // SWR-based agent creation; the caller decides the destination after the
  // mutation resolves (origin decides destination per the create contract).
  const { trigger: mutateAgent, isMutating: isMutatingAgent } = useSWRMutation(
    'agent.createAgent',
    async (_key: string, { arg }: { arg?: CreateAgentParams }) => {
      const result = await storeCreateAgent(arg ?? {});
      await refreshAgentList();
      return result;
    },
  );

  // SWR-based group creation landing straight in the conversation
  const { trigger: mutateGroup, isMutating: isMutatingGroup } = useSWRMutation(
    'group.createGroup',
    async (_key: string, { arg }: { arg?: CreateAgentOptions & { title?: string } }) => {
      const groupId = await createGroup(
        {
          config: DEFAULT_CHAT_GROUP_CHAT_CONFIG,
          groupId: arg?.groupId,
          title: arg?.title || t('defaultGroupChat'),
          // Forward the caller's bucket choice — without it a "Create Private
          // Group" entry silently lands the group in the public bucket.
          ...(arg?.visibility ? { visibility: arg.visibility } : {}),
        },
        [],
        true, // silent mode - don't switch session, we'll navigate instead
      );
      return groupId;
    },
    {
      onSuccess: async (groupId) => {
        navigate(`/group/${groupId}`);
        await refreshAgentList();
        await loadGroups();
      },
    },
  );

  /**
   * One-click Orvilo agent create — no LLM call, no purpose field, no Agent
   * Builder (docs/development/device-execution-contract.md). Writes the fixed
   * `type:'orvilo'` binding and a client-side idempotency key so a
   * double-click / UI retry can never mint a twin; everything else inherits
   * the legal defaults (the inbox's temporary model is deliberately NOT
   * copied). The entry's origin decides the destination.
   */
  const createAgent = useCallback(
    async (options?: CreateAgentOptions) => {
      if (!canCreate) return;

      const result = await mutateAgent({
        clientRequestId: crypto.randomUUID(),
        config: {
          agencyConfig: { heterogeneousProvider: { type: 'orvilo' } },
          title: 'Orvilo AI',
        },
        groupId: options?.groupId,
        visibility: options?.visibility,
      });

      if (options?.origin === 'settings') {
        navigate(`/settings/agents/${result.agentId}`);
      } else {
        openNewConversation({ agentId: result.agentId });
      }
      options?.onSuccess?.();
    },
    [canCreate, mutateAgent, navigate],
  );

  /**
   * Create group from template
   * Uses backend batch creation for better performance and consistency
   */
  const createGroupFromTemplate = useCallback(
    async (templateId: string, selectedMemberTitles?: string[]) => {
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

        // Prepare member configs for batch creation
        const memberConfigs: GroupMemberConfig[] = membersToCreate.map((member) => ({
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
    [canCreate, groupTemplates, refreshAgentList, loadGroups, switchToGroup, t],
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

  /**
   * Create empty group and land in its conversation
   */
  const createEmptyGroup = useCallback(
    async (options?: CreateAgentOptions & { title?: string }) => {
      if (!canCreate) return;

      await mutateGroup(options);
    },
    [canCreate, mutateGroup],
  );

  const agentModal = useOptionalAgentModal();
  const openCreateModal = agentModal?.openCreateModal;
  const openCreateGroupModal = agentModal?.openCreateGroupModal;

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
    (options?: CreateAgentOptions): MenuItem | null => {
      return {
        icon: <MonitorSmartphone size={14} />,
        disabled: !canCreate,
        key: 'newPlatformAgent',
        label: (
          <div className="flex flex-col gap-[1px]">
            <div>{t('newPlatformAgent')}</div>
            <div className="text-[12px] text-muted-foreground">{t('newPlatformAgentDesc')}</div>
          </div>
        ),
        sfSymbol: 'laptopcomputer.and.iphone',
        onClick: (info) => {
          stopMenuItemDomEvent(info.domEvent);
          if (!canCreate) return;
          openConnectAgentModal(
            options?.groupId || options?.visibility
              ? { groupId: options?.groupId, visibility: options?.visibility }
              : undefined,
          );
        },
      };
    },
    [t, canCreate],
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
  const createTopLevelMenuItems = useCallback((): MenuItem[] => {
    const connectItem = createConnectAgentMenuItem();
    const groupFromDescription = createGroupFromDescriptionMenuItem();

    return [
      createAgentMenuItem(),
      createGroupChatMenuItem(),
      ...(groupFromDescription ? [groupFromDescription] : []),
      ...(connectItem ? [{ type: 'divider' as const }, connectItem] : []),
      { type: 'divider' as const },
      createAgentListMenuItem(),
    ];
  }, [
    createAgentListMenuItem,
    createAgentMenuItem,
    createConnectAgentMenuItem,
    createGroupChatMenuItem,
    createGroupFromDescriptionMenuItem,
  ]);

  return {
    configMenuItem,
    createAgent,
    createAgentListMenuItem,
    createAgentMenuItem,
    createConnectAgentMenuItem,
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
    isLoading: isMutatingAgent || isMutatingGroup || isCreatingGroup || isCreatingSessionGroup,
    isMutatingAgent,
  };
};
