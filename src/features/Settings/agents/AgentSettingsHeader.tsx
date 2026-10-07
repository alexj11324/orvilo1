'use client';

import { HETEROGENEOUS_TYPE_LABELS } from '@orvilo/heterogeneous-agents';
import isEqual from 'fast-deep-equal';
import { MoreHorizontal, PencilIcon, Trash } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import AutoSaveHint from '@/components/Editor/AutoSaveHint';
import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { DESKTOP_HEADER_ICON_SMALL_SIZE } from '@/const/layoutTokens';
import { createAgentIdentityModal } from '@/features/AgentIdentityModal';
import { AgentRuntimeIcon } from '@/features/AgentRuntimeIcon';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useResourceAccess } from '@/features/ResourcePermission/useResourceAccess';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { useAgentStore } from '@/store/agent';
import { agentSelectors, builtinAgentSelectors } from '@/store/agent/selectors';
import { useHomeStore } from '@/store/home';
import { resolveAgentRuntimeType } from '@/utils/agentRuntimeIdentity';
import { getDeleteErrorMessageKey } from '@/utils/forbiddenError';

interface AgentSettingsHeaderProps {
  agentId: string;
}

/**
 * The settings page's compact identity header — 48px avatar, display name,
 * with a single ··· menu carrying Rename / Delete. It replaces the whole profile chrome (banner Hero,
 * breadcrumb, tabs, action menu) on the settings surface; the identity form
 * modal owns actual editing.
 */
const AgentSettingsHeader = memo<AgentSettingsHeaderProps>(({ agentId }) => {
  const { t } = useTranslation(['setting', 'chat', 'common', 'agent']);
  const navigate = useWorkspaceAwareNavigate();

  const meta = useAgentStore(agentSelectors.getAgentMetaById(agentId), isEqual);
  const runtimeType = useAgentStore((s) =>
    resolveAgentRuntimeType(agentSelectors.getAgentConfigById(agentId)(s)),
  );
  const saveStatus = useAgentStore((s) => (s.saveAgentId === agentId ? s.saveStatus : 'idle'));
  const lastUpdatedTime = useAgentStore((s) => s.lastUpdatedTime);
  const retryAgentSave = useAgentStore((s) => s.retryAgentSave);
  const removeAgent = useHomeStore((s) => s.removeAgent);

  const { allowed: hasEditPermission } = usePermission('edit_own_content');
  const { canEditResource, canManageResource } = useResourceAccess('agent', agentId);
  const isBuiltinAgent = useAgentStore(builtinAgentSelectors.isBuiltinAgent(agentId));
  const canConfigure = hasEditPermission && canEditResource;
  const canManage = hasEditPermission && canManageResource && !isBuiltinAgent;

  const personalName = meta.name?.trim();

  const handleDelete = useCallback(() => {
    if (!canManage) return;
    confirmModal({
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await removeAgent(agentId);
        } catch (error) {
          toast.error(t(getDeleteErrorMessageKey(error), { ns: 'common' }));
          return;
        }
        toast.success(t('confirmRemoveSessionSuccess', { ns: 'chat' }));
        navigate('/settings/agents', { escape: true });
      },
      title: t('confirmRemoveSessionItemAlert', { ns: 'chat' }),
    });
  }, [agentId, canManage, navigate, removeAgent, t]);

  const menuItems = useMemo(
    () =>
      [
        {
          disabled: !canConfigure,
          icon: <PencilIcon />,
          key: 'rename',
          label: t('settingAgent.identity.rename', { ns: 'setting' }),
          onClick: () => {
            if (!canConfigure) return;
            createAgentIdentityModal(agentId);
          },
        },
        canManage ? { type: 'divider' as const } : null,
        canManage
          ? {
              danger: true,
              icon: <Trash />,
              key: 'delete',
              label: t('delete', { ns: 'common' }),
              onClick: handleDelete,
            }
          : null,
      ].filter(Boolean),
    [agentId, canConfigure, canManage, handleDelete, t],
  );

  return (
    <div className="flex items-center gap-3" style={{ paddingBlock: '8px 12px' }}>
      <span
        aria-label={HETEROGENEOUS_TYPE_LABELS[runtimeType] ?? runtimeType}
        className="inline-flex flex-none overflow-hidden rounded-full"
        role="img"
        style={{ width: 48, height: 48 }}
      >
        <AgentRuntimeIcon size={48} type={runtimeType} />
      </span>
      <div className="flex flex-col gap-0.5" style={{ minWidth: 0 }}>
        <div className="truncate" style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.3 }}>
          {personalName || t('settingAgent.identity.untitled', { ns: 'setting' })}
        </div>
      </div>
      <div className="flex-1" />
      {saveStatus !== 'idle' && (
        <AutoSaveHint
          lastUpdatedTime={lastUpdatedTime}
          saveStatus={saveStatus}
          onRetry={() => void retryAgentSave()}
        />
      )}
      <SidebarDropdownMenu items={menuItems} placement="bottomRight">
        <ActionIcon icon={MoreHorizontal} size={DESKTOP_HEADER_ICON_SMALL_SIZE} />
      </SidebarDropdownMenu>
    </div>
  );
});

AgentSettingsHeader.displayName = 'AgentSettingsHeader';

export default AgentSettingsHeader;
