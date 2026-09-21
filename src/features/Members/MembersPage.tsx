'use client';

import { DropdownMenu, Empty, Flexbox, Icon, Input, Tooltip } from '@lobehub/ui';
import { Button, SkeletonText, Tag, Text, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import {
  Bot,
  Crown,
  Mail,
  MoreHorizontal,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useActiveWorkspace } from '@/business/client/hooks/useActiveWorkspace';
import { useWorkspaceCapabilities } from '@/business/client/hooks/useWorkspaceCapabilities';
import Avatar from '@/components/Avatar';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { openInviteTeammateModal } from '../Teammates';
import type {
  WorkspaceAgentSummary,
  WorkspaceInvitationSummary,
  WorkspaceMemberSummary,
} from '../Teammates/api/contract';
import {
  useTeammateActions,
  useWorkspaceAgentsQuery,
  useWorkspaceInvitationsQuery,
  useWorkspaceMembersQuery,
} from '../Teammates/api/hooks';
import { memberStatus } from '../Teammates/api/roleCapabilities';

const styles = createStaticStyles(({ css }) => ({
  cell: css`
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
  `,
  groupLabel: css`
    padding-block: 4px 6px;

    font-size: 12px;
    font-weight: 600;
    color: ${cssVar.colorTextTertiary};
    text-transform: uppercase;
    letter-spacing: 0.04em;
  `,
  meta: css`
    overflow: hidden;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  name: css`
    overflow: hidden;

    font-size: 14px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  row: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) 100px 110px 130px 40px;
    gap: 12px;
    align-items: center;

    padding-block: 10px;
    padding-inline: 4px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
}));

interface DirectoryRow {
  id: string;
  kind: 'application' | 'invitation' | 'person';
  searchText: string;
  sortName: string;
  value: WorkspaceAgentSummary | WorkspaceInvitationSummary | WorkspaceMemberSummary;
}

const normalize = (value: string | null | undefined) => (value ?? '').toLowerCase();

const roleColor: Record<string, string> = {
  admin: 'geekblue',
  member: 'default',
  owner: 'gold',
  viewer: 'default',
};

/**
 * `/members` — the workspace directory. A read surface that lists every
 * identity the workspace exposes (people, workspace agents, open
 * invitations) behind one searchable list. Member administration stays on
 * `/settings/members`; invitation lifecycle actions that are safe inline
 * (resend / revoke) stay in the row menu and honor the same capability gate
 * as the settings page.
 */
const MembersPage = memo(() => {
  const { t } = useTranslation(['common', 'setting']);
  const navigate = useNavigate();
  const workspace = useActiveWorkspace();
  const capabilities = useWorkspaceCapabilities();
  const callerUserId = useUserStore(userProfileSelectors.userId);
  const { resendInvitation, revokeInvitation } = useTeammateActions();
  const [query, setQuery] = useState('');

  const enabled = Boolean(workspace);
  const membersQuery = useWorkspaceMembersQuery({ enabled });
  const agentsQuery = useWorkspaceAgentsQuery({ enabled });
  // Invitations are invite-capability gated server-side; ordinary members see
  // the people + agents groups only.
  const invitationsQuery = useWorkspaceInvitationsQuery({
    enabled: enabled && capabilities.canInvite,
  });

  const rows = useMemo<DirectoryRow[]>(() => {
    const next: DirectoryRow[] = [];
    for (const member of membersQuery.members ?? []) {
      const name = member.user?.fullName || member.user?.username || member.user?.email || '';
      next.push({
        id: `person:${member.userId}`,
        kind: 'person',
        searchText: normalize(`${name} ${member.user?.email ?? ''}`),
        sortName: normalize(name),
        value: member,
      });
    }
    for (const agent of agentsQuery.data ?? []) {
      next.push({
        id: `application:${agent.id}`,
        kind: 'application',
        searchText: normalize(`${agent.name} ${agent.maintainer?.name ?? ''}`),
        sortName: normalize(agent.name),
        value: agent,
      });
    }
    for (const invitation of invitationsQuery.data ?? []) {
      if (invitation.status === 'accepted' || invitation.status === 'revoked') continue;
      next.push({
        id: `invitation:${invitation.id}`,
        kind: 'invitation',
        searchText: normalize(invitation.email),
        sortName: normalize(invitation.email),
        value: invitation,
      });
    }
    return next.sort((a, b) => a.sortName.localeCompare(b.sortName));
  }, [membersQuery.members, agentsQuery.data, invitationsQuery.data]);

  const needle = normalize(query).trim();
  const visible = useMemo(
    () => (needle ? rows.filter((row) => row.searchText.includes(needle)) : rows),
    [needle, rows],
  );

  const groups = useMemo(
    () =>
      (
        [
          ['person', t('members.groupPeople', { ns: 'common' })],
          ['application', t('members.groupAgents', { ns: 'common' })],
          ['invitation', t('members.groupInvitations', { ns: 'common' })],
        ] as const
      )
        .map(([kind, label]) => ({ kind, label, rows: visible.filter((r) => r.kind === kind) }))
        .filter((group) => group.rows.length > 0),
    [t, visible],
  );

  const settingsPath = workspace
    ? buildWorkspaceAwarePath('/settings/members', workspace.slug)
    : '/settings/members';

  const renderPerson = (member: WorkspaceMemberSummary) => {
    const status = memberStatus(member);
    const joinedAt = member.joinedAt ? new Date(member.joinedAt) : null;
    const canManage = capabilities.canManageMembers && member.userId !== callerUserId;
    return (
      <>
        <div className={styles.cell}>
          <Avatar avatar={member.user?.avatar} size={28} title={member.user?.fullName ?? ''} />
          <div style={{ minWidth: 0 }}>
            <div className={styles.name}>
              {member.user?.fullName || member.user?.username || member.user?.email}
            </div>
            {member.user?.email ? <div className={styles.meta}>{member.user.email}</div> : null}
          </div>
        </div>
        <div>
          <Tag color={roleColor[member.role]}>{member.role}</Tag>
          {member.role === 'owner' ? (
            <Tooltip title={t('members.ownerHint', { ns: 'common' })}>
              <Icon
                icon={Crown}
                size={14}
                style={{ color: cssVar.colorWarning, marginInlineStart: 4 }}
              />
            </Tooltip>
          ) : null}
        </div>
        <div>
          {status === 'suspended' ? (
            <Tag color="orange">{t('members.statusSuspended', { ns: 'common' })}</Tag>
          ) : status === 'removed' ? (
            <Tag>{t('members.statusRemoved', { ns: 'common' })}</Tag>
          ) : null}
        </div>
        <div className={styles.meta}>{joinedAt ? joinedAt.toLocaleDateString() : '—'}</div>
        <div>
          {canManage ? (
            <DropdownMenu
              items={[
                {
                  icon: <Icon icon={Settings2} size={14} />,
                  key: 'manage',
                  label: t('members.manageInSettings', { ns: 'common' }),
                  onClick: () => navigate(settingsPath),
                },
              ]}
            >
              <Button icon={<Icon icon={MoreHorizontal} size={16} />} size="small" type="text" />
            </DropdownMenu>
          ) : null}
        </div>
      </>
    );
  };

  const renderApplication = (agent: WorkspaceAgentSummary) => (
    <>
      <div className={styles.cell}>
        <Avatar avatar={agent.avatar} size={28} title={agent.name} />
        <div style={{ minWidth: 0 }}>
          <div className={styles.name}>{agent.name}</div>
          {agent.maintainer?.name ? (
            <div className={styles.meta}>
              {t('members.maintainedBy', { name: agent.maintainer.name, ns: 'common' })}
            </div>
          ) : null}
        </div>
      </div>
      <div>
        <Tag icon={<Icon icon={Bot} size={12} />}>{t('members.kindAgent', { ns: 'common' })}</Tag>
      </div>
      <div>
        {agent.status === 'disabled' ? (
          <Tag color="orange">{t('members.statusDisabled', { ns: 'common' })}</Tag>
        ) : null}
      </div>
      <div className={styles.meta}>
        {agent.projects?.length
          ? t('members.projectCount', { count: agent.projects.length, ns: 'common' })
          : '—'}
      </div>
      <div />
    </>
  );

  const renderInvitation = (invitation: WorkspaceInvitationSummary) => {
    const expired = invitation.status === 'expired';
    const inviteActions = capabilities.canInvite
      ? [
          {
            icon: <Icon icon={RefreshCw} size={14} />,
            key: 'resend',
            label: t('members.resendInvitation', { ns: 'common' }),
            onClick: () => {
              void resendInvitation(invitation.id).then((ok) => {
                if (!ok) toast.error(t('workspaceSetting.members.actionFailed', { ns: 'setting' }));
              });
            },
          },
          {
            danger: true,
            icon: <Icon icon={Trash2} size={14} />,
            key: 'revoke',
            label: t('members.revokeInvitation', { ns: 'common' }),
            onClick: () => {
              void revokeInvitation(invitation.id).then((ok) => {
                if (!ok) toast.error(t('workspaceSetting.members.actionFailed', { ns: 'setting' }));
              });
            },
          },
        ]
      : [];
    return (
      <>
        <div className={styles.cell}>
          <Avatar avatar={null} size={28} title={invitation.email} />
          <div style={{ minWidth: 0 }}>
            <div className={styles.name}>{invitation.email}</div>
            {invitation.inviter?.name ? (
              <div className={styles.meta}>
                {t('members.invitedBy', { name: invitation.inviter.name, ns: 'common' })}
              </div>
            ) : null}
          </div>
        </div>
        <div>
          <Tag icon={<Icon icon={Mail} size={12} />}>{invitation.role}</Tag>
        </div>
        <div>
          <Tag color={expired ? 'orange' : 'blue'}>
            {expired
              ? t('members.statusExpired', { ns: 'common' })
              : t('members.statusPending', { ns: 'common' })}
          </Tag>
        </div>
        <div className={styles.meta}>{new Date(invitation.expiresAt).toLocaleDateString()}</div>
        <div>
          {inviteActions.length > 0 ? (
            <DropdownMenu items={inviteActions}>
              <Button icon={<Icon icon={MoreHorizontal} size={16} />} size="small" type="text" />
            </DropdownMenu>
          ) : null}
        </div>
      </>
    );
  };

  const renderRow = (row: DirectoryRow) => (
    <div className={styles.row} key={row.id}>
      {row.kind === 'person'
        ? renderPerson(row.value as WorkspaceMemberSummary)
        : row.kind === 'application'
          ? renderApplication(row.value as WorkspaceAgentSummary)
          : renderInvitation(row.value as WorkspaceInvitationSummary)}
    </div>
  );

  const loading =
    membersQuery.isLoading || (enabled && agentsQuery.isLoading) || invitationsQuery.isLoading;
  const loadError = membersQuery.error || agentsQuery.error || invitationsQuery.error;

  return (
    <Flexbox flex={1} height="100%">
      <Flexbox
        horizontal
        align="center"
        justify="space-between"
        paddingBlock={12}
        paddingInline={16}
        style={{ borderBlockEnd: `1px solid ${cssVar.colorBorderSecondary}` }}
      >
        <Text fontSize={15} weight={600}>
          {t('members.title', { ns: 'common' })}
        </Text>
        <Flexbox horizontal align="center" gap={8}>
          {capabilities.canInvite ? (
            <Button
              icon={<Icon icon={UserPlus} size={16} />}
              type="primary"
              onClick={() => openInviteTeammateModal()}
            >
              {t('workspaceSetting.members.inviteButton', { ns: 'setting' })}
            </Button>
          ) : null}
          {capabilities.canManageMembers ? (
            <Tooltip title={t('members.manageInSettings', { ns: 'common' })}>
              <Button
                icon={<Icon icon={Settings2} size={16} />}
                onClick={() => navigate(settingsPath)}
              />
            </Tooltip>
          ) : null}
        </Flexbox>
      </Flexbox>
      <Flexbox flex={1} gap={4} padding={24} style={{ overflowY: 'auto' }}>
        <Input
          allowClear
          placeholder={t('members.searchPlaceholder', { ns: 'common' })}
          prefix={<Icon icon={Search} size={14} />}
          style={{ marginBlockEnd: 12, maxWidth: 320 }}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {!workspace ? (
          <Empty description={t('workspaceSetting.members.noWorkspace', { ns: 'setting' })} />
        ) : loadError ? (
          <Empty description={t('workspaceSetting.members.loadFailed', { ns: 'setting' })} />
        ) : loading ? (
          <Flexbox gap={16}>
            {[0, 1, 2, 3].map((row) => (
              <SkeletonText key={row} style={{ marginBottom: 0, width: '60%' }} />
            ))}
          </Flexbox>
        ) : groups.length === 0 ? (
          <Empty
            description={
              needle
                ? t('members.emptySearch', { ns: 'common' })
                : t('workspaceSetting.members.empty', { ns: 'setting' })
            }
          />
        ) : (
          groups.map((group) => (
            <div key={group.kind}>
              <div className={styles.groupLabel}>{group.label}</div>
              {group.rows.map(renderRow)}
            </div>
          ))
        )}
      </Flexbox>
    </Flexbox>
  );
});

MembersPage.displayName = 'MembersPage';

export default MembersPage;
