'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { Button, Tabs, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { UserPlus } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspace } from '@/business/client/hooks/useActiveWorkspace';
import { useWorkspaceCapabilities } from '@/business/client/hooks/useWorkspaceCapabilities';
import {
  AgentsPanel,
  InvitationsPanel,
  MembersPanel,
  openInviteTeammateModal,
} from '@/features/Teammates';

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

type TabKey = 'agents' | 'invitations' | 'members';

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
  const [tab, setTab] = useState<TabKey>('members');

  const tabs = useMemo(
    () => [
      { key: 'members', label: t('workspaceSetting.members.tabMembers') },
      { key: 'invitations', label: t('workspaceSetting.members.tabInvitations') },
      { key: 'agents', label: t('workspaceSetting.members.tabAgents') },
    ],
    [t],
  );

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
        {capabilities.canInvite && (
          <Button
            icon={<Icon icon={UserPlus} size={16} />}
            type="primary"
            onClick={() => openInviteTeammateModal()}
          >
            {t('workspaceSetting.members.inviteButton')}
          </Button>
        )}
      </div>
      <Tabs
        activeKey={tab}
        items={tabs}
        size="small"
        variant="square"
        onChange={(key) => setTab(key as TabKey)}
      />
      {tab === 'members' && <MembersPanel />}
      {tab === 'invitations' && <InvitationsPanel />}
      {tab === 'agents' && <AgentsPanel />}
    </Flexbox>
  );
});

WorkspaceMembers.displayName = 'WorkspaceMembers';

export default WorkspaceMembers;
