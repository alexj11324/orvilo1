'use client';

import { createStaticStyles } from 'antd-style';
import { LogOut, UserPlus } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspace } from '@/business/client/hooks/useActiveWorkspace';
import { useSwitchWorkspace } from '@/business/client/hooks/useSwitchWorkspace';
import { useWorkspaceCapabilities } from '@/business/client/hooks/useWorkspaceCapabilities';
import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
      <div className={`${styles.page} flex flex-col gap-4`}>
        <div className="text-[14px] text-muted-foreground">
          {t('workspaceSetting.members.noWorkspace')}
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.page} flex flex-col gap-2`}>
      <div className={styles.header}>
        <div className="text-[16px] font-semibold">{t('workspaceSetting.members.title')}</div>
        <div className="flex items-center gap-2">
          {(capabilities.canLeave || capabilities.isOwner) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span>
                      <Button
                        disabled={!capabilities.canLeave}
                        variant="destructive"
                        onClick={handleLeave}
                      >
                        <LogOut size={16} />
                        {t('workspaceSetting.members.leave')}
                      </Button>
                    </span>
                  }
                />
                {capabilities.isOwner && (
                  <TooltipContent>{t('workspaceSetting.members.leaveOwnerHint')}</TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )}
          {capabilities.canInvite && (
            <Button variant="default" onClick={() => openInviteTeammateModal()}>
              <UserPlus size={16} />
              {t('workspaceSetting.members.inviteButton')}
            </Button>
          )}
        </div>
      </div>
      <Tabs value={tab} onValueChange={(key) => setTab(key as TabKey)}>
        <TabsList>
          {tabs.map((item) => (
            <TabsTrigger key={item.key} value={item.key}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {tab === 'members' && <MembersPanel />}
      {tab === 'invitations' && capabilities.canInvite && <InvitationsPanel />}
      {tab === 'agents' && <AgentsPanel />}
    </div>
  );
});

WorkspaceMembers.displayName = 'WorkspaceMembers';

export default WorkspaceMembers;
