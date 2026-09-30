'use client';

import { upsertPluginMode } from '@orvilo/types';
import isEqual from 'fast-deep-equal';
import { CopyIcon, PlugZapIcon, PlusIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useIsWorkspaceOwner } from '@/business/client/hooks/useIsWorkspaceOwner';
import { DropdownMenu } from '@/components/ItemsMenu';
import { confirmModal } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { createAgentSkillStoreModal } from '@/features/AgentSkillStore';
import PluginTag from '@/features/ProfileEditor/PluginTag';
import { usePermission } from '@/hooks/usePermission';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { useToolStore } from '@/store/tool';
import { connectorSelectors } from '@/store/tool/slices/connector';
import type { ConnectorWithTools } from '@/store/tool/slices/connector/types';
import { useUserStore } from '@/store/user';

/**
 * The "Agent Tools" section (top of the tools area): the connectors owned by
 * this agent, rendered with the same chips as User Tools (PluginTag). Removing
 * an agent chip is a two-step op — unpin it from `agents.plugins` AND delete the
 * agent-owned `user_connectors` row (one more step than the user side).
 */
const AgentToolsSection = memo<{ agentId: string; onStartCopy: () => void }>(
  ({ agentId, onStartCopy }) => {
    const { t } = useTranslation('setting');
    const { allowed: canEdit } = usePermission('edit_own_content');

    // Deleting an agent connector row is creator-or-owner only in a workspace
    // (mirrors the server `assertWorkspaceRowManageable` gate). Used to hide the
    // remove (×) on shared connectors the current member can't delete, so B
    // never clicks into a FORBIDDEN error on A's connector.
    const activeWorkspaceId = useActiveWorkspaceId();
    const isWorkspaceOwner = useIsWorkspaceOwner();
    const currentUserId = useUserStore((s) => s.user?.id);

    const agentConnectors = useToolStore(connectorSelectors.agentConnectors(agentId), isEqual);
    const detachConnectorFromAgent = useToolStore((s) => s.detachConnectorFromAgent);
    const updateAgentConfigById = useAgentStore((s) => s.updateAgentConfigById);

    const handleRemove = async (connector: ConnectorWithTools) => {
      const ok = await confirmModal({ content: t('settingAgent.agentTools.removeOwnedConfirm') });
      if (!ok) return;
      // 1) remove from agents.plugins, 2) delete the agent connector row.
      const config = agentSelectors.getAgentConfigById(agentId)(useAgentStore.getState());
      await updateAgentConfigById(agentId, {
        plugins: upsertPluginMode(config?.plugins, connector.identifier, 'auto'),
      });
      await detachConnectorFromAgent(connector.id, agentId, 'delete');
    };

    const addMenuItems = [
      {
        desc: t('settingAgent.agentTools.connectNew.desc'),
        icon: <PlugZapIcon />,
        key: 'connectNew',
        label: t('settingAgent.agentTools.connectNew.title'),
        onClick: () => createAgentSkillStoreModal(agentId),
      },
      {
        desc: t('settingAgent.agentTools.copy.desc'),
        icon: <CopyIcon />,
        key: 'copy',
        label: t('settingAgent.agentTools.copy.title'),
        onClick: onStartCopy,
      },
    ];

    return (
      <div className="flex flex-col gap-2">
        <div className="text-[12px] font-medium text-muted-foreground">
          {t('settingAgent.agentTools.tabAgent')} · {agentConnectors.length}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DropdownMenu items={addMenuItems} placement={'bottomLeft'}>
            <Button disabled={!canEdit} size="sm" variant="ghost">
              <PlusIcon data-icon="inline-start" />
              {t('settingAgent.agentTools.add')}
            </Button>
          </DropdownMenu>

          {agentConnectors.length === 0 && (
            <div className="text-[12px] text-muted-foreground">
              {t('settingAgent.agentTools.agentEmpty')}
            </div>
          )}

          {agentConnectors.map((connector) => {
            // Outside a workspace (personal), or when the row has no known
            // creator, fall back to the existing edit-permission gate. In a
            // workspace, only the creator or a workspace owner may delete.
            const canManageRow =
              !activeWorkspaceId ||
              !connector.userId ||
              connector.userId === currentUserId ||
              isWorkspaceOwner;
            return (
              <PluginTag
                agentId={agentId}
                disabled={!canEdit}
                key={connector.id}
                pluginId={connector.identifier}
                removable={canManageRow}
                showAuthor={!!activeWorkspaceId}
                onRemove={() => {
                  handleRemove(connector);
                }}
              />
            );
          })}
        </div>
      </div>
    );
  },
);

AgentToolsSection.displayName = 'AgentToolsSection';

export default AgentToolsSection;
