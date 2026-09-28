'use client';

import { Flexbox, Icon, Tooltip } from '@lobehub/ui';
import { Button, confirmModal, Tabs, Text, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { LogOut, UserPlus } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspace } from '@/business/client/hooks/useActiveWorkspace';
import { useSwitchWorkspace } from '@/business/client/hooks/useSwitchWorkspace';
import { useWorkspaceCapabilities } from '@/business/client/hooks/useWorkspaceCapabilities';
import {
  AgentsPanel,
  InvitationsPanel,
  MembersPanel,
  openInviteTeammateModal,
} from '@/features/Teammates';
import { useTeammateActions } from '@/features/Teammates/api/hooks';

import { runLeaveWorkspace } from './workspaceMemberLeave';
import { type WorkspaceMemberTabKey, workspaceMemberTabKeys } from './workspaceMemberTabs';

const styles = createStaticStyles(({ css }) => ({
  header: css`
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;

    padding-block-end: 12px;
  `,
  page: css`
    padding-block: 8px 24px;
    padding-inline: 24px;
  `,
}));

type TabKey = WorkspaceMemberTabKey;

/**
 * Workspace members settings: the member roster, the invitation lifecycle,
 * and the workspace-visible agent roster behind one tabbed page. Invite is
 * offered only when the caller's workspace role can actually grant
 * membership — the server enforces the same ceiling.
 */
const WorkspaceMembers = memo(() => {
  const { t } = useTranslation('setting');
  const workspace = useActiveWorkspace();
  const capabilities = useWorkspaceCapabilities();
  const { leave } = useTeammateActions();
  const { switchToPersonal } = useSwitchWorkspace();
  const [tab, setTab] = useState<TabKey>('members');

  const handleLeave = useCallback(() => {
    if (!workspace) return;
    confirmModal({
      cancelText: t('cancel', { ns: 'common' }),
      content: t('workspaceSetting.members.leaveConfirmContent', { name: workspace.name }),
      okButtonProps: { danger: true },
      okText: t('workspaceSetting.members.leave'),
      onOk: async () => {
        const ok = await runLeaveWorkspace({ leave, switchToPersonal });
        if (ok) toast.success(t('workspaceSetting.members.leaveSuccess'));
      },
      title: t('workspaceSetting.members.leaveConfirmTitle', { name: workspace.name }),
    });
  }, [leave, switchToPersonal, t, workspace]);

  const tabs = useMemo(() => {
    const labels: Record<WorkspaceMemberTabKey, string> = {
      agents: t('workspaceSetting.members.tabAgents'),
      invitations: t('workspaceSetting.members.tabInvitations'),
      members: t('workspaceSetting.members.tabMembers'),
    };
    // `canInvite` mirrors the invitations endpoint's role ceiling — without
    // it the tab is withheld entirely instead of mounting a doomed query.
    return workspaceMemberTabKeys(capabilities.canInvite).map((key) => ({
      key,
      label: labels[key],
    }));
  }, [t, capabilities.canInvite]);

  if (!workspace) {
    return (
      <Flexbox className={styles.page} gap={16}>
        <Text fontSize={14} type="secondary">
          {t('workspaceSetting.members.noWorkspace')}
        </Text>
      </Flexbox>
    );
  }

  return (
    <Flexbox className={styles.page} gap={8}>
      <div className={styles.header}>
        <Text fontSize={16} weight={600}>
          {t('workspaceSetting.members.title')}
        </Text>
        <Flexbox horizontal align="center" gap={8}>
          {(capabilities.canLeave || capabilities.isOwner) && (
            <Tooltip
              title={
                capabilities.isOwner ? t('workspaceSetting.members.leaveOwnerHint') : undefined
              }
            >
              <Button
                danger
                disabled={!capabilities.canLeave}
                icon={<Icon icon={LogOut} size={16} />}
                onClick={handleLeave}
              >
                {t('workspaceSetting.members.leave')}
              </Button>
            </Tooltip>
          )}
          {capabilities.canInvite && (
            <Button
              icon={<Icon icon={UserPlus} size={16} />}
              type="primary"
              onClick={() => openInviteTeammateModal()}
            >
              {t('workspaceSetting.members.inviteButton')}
            </Button>
          )}
        </Flexbox>
      </div>
      <Tabs
        activeKey={tab}
        items={tabs}
        size="small"
        variant="square"
        onChange={(key) => setTab(key as TabKey)}
      />
      {tab === 'members' && <MembersPanel />}
      {tab === 'invitations' && capabilities.canInvite && <InvitationsPanel />}
      {tab === 'agents' && <AgentsPanel />}
    </Flexbox>
  );
});

WorkspaceMembers.displayName = 'WorkspaceMembers';

export default WorkspaceMembers;
