'use client';

import { agentSecondaryDisplayName } from '@orvilo/types';
import { cn } from 'cn';
import isEqual from 'fast-deep-equal';
import { MoreHorizontal, PencilIcon, Share2Icon, Trash } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useAgentShareSupported } from '@/business/client/useAgentShareSupported';
import ActionIcon from '@/components/ActionIcon';
import AutoSaveHint from '@/components/Editor/AutoSaveHint';
import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
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
 * and the `role · @slug` secondary line — with a single ··· menu carrying
 * Rename / Share / Delete. It replaces the whole profile chrome (banner Hero,
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
  const role = meta.title?.trim();
  const suppressDuplicateRole =
    !!personalName &&
    !!role &&
    agentSecondaryDisplayName({ name: personalName, title: role }) === undefined;

  const { visible: shareVisible } = useAgentShareSupported(agentId);
  const canShareAgent = shareVisible === true && canConfigure;

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
        canShareAgent
          ? {
              icon: <Share2Icon />,
              key: 'share',
              label: t('share.entry', { ns: 'agent' }),
              onClick: () => navigate(`/agent/${agentId}/share`),
            }
          : null,
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
    [agentId, canConfigure, canManage, canShareAgent, handleDelete, navigate, t],
  );

  return (
    <div className="flex items-center gap-3 pbs-2 pbe-3">
      <AgentRuntimeIcon size={48} type={runtimeType} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="truncate text-xl leading-7 font-semibold">
          {personalName || t('settingAgent.identity.untitled', { ns: 'setting' })}
        </div>
        <div className="flex min-w-0 items-center gap-2">
          {!suppressDuplicateRole ? (
            <div
              className={cn(
                'truncate text-xs leading-5',
                role ? 'text-muted-foreground' : 'text-foreground-tertiary',
              )}
            >
              {role || t('settingAgent.role.unset', { ns: 'setting' })}
            </div>
          ) : null}
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
        <ActionIcon
          aria-label={t('more', { ns: 'common' })}
          icon={MoreHorizontal}
          size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
        />
      </SidebarDropdownMenu>
    </div>
  );
});

AgentSettingsHeader.displayName = 'AgentSettingsHeader';

export default AgentSettingsHeader;
