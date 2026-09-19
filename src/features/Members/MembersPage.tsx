'use client';

import { Center, Empty, Flexbox, Icon, SearchBar, Tooltip } from '@lobehub/ui';
import { ActionIcon, Button, DropdownMenu, Segmented, Tag, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { Crown, MoreHorizontal, RefreshCw, Settings2, Trash2, UserPlus } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useActiveWorkspace } from '@/business/client/hooks/useActiveWorkspace';
import { useWorkspaceCapabilities } from '@/business/client/hooks/useWorkspaceCapabilities';
import Avatar from '@/components/Avatar';
import LiteTable, { type LiteTableColumn } from '@/components/LiteTable';
import NavHeader from '@/features/NavHeader';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { WorkSurface, WorkSurfaceCollection, WorkSurfaceToolbar } from '@/features/WorkSurface';
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
    padding-block: 12px 4px;

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
}));

type DirectoryRow =
  | { id: string; kind: 'agent'; sortName: string; value: WorkspaceAgentSummary }
  | { id: string; kind: 'invitation'; sortName: string; value: WorkspaceInvitationSummary }
  | { id: string; kind: 'person'; sortName: string; value: WorkspaceMemberSummary };

type DirectoryFilter = 'agent' | 'all' | 'invitation' | 'person';

const normalize = (value: string | null | undefined) => (value ?? '').toLowerCase();

const roleColor: Record<string, string> = {
  admin: 'geekblue',
  member: 'default',
  owner: 'gold',
  viewer: 'default',
};

const formatDate = (value: Date | string | null | undefined) =>
  value ? new Date(value).toLocaleDateString() : '—';

/**
 * `/members` — the workspace directory. A read surface that lists every
 * identity the workspace exposes (people, workspace agents, open
 * invitations) behind one searchable directory table. Every column keeps one
 * meaning for every row kind; a field the contract does not carry reads `—`
 * rather than borrowing a neighbour's data. Member administration stays on
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
  const [groupFilter, setGroupFilter] = useState<DirectoryFilter>('all');

  const enabled = Boolean(workspace);
  const membersQuery = useWorkspaceMembersQuery({ enabled });
  const agentsQuery = useWorkspaceAgentsQuery({ enabled });
  // Invitations are invite-capability gated server-side; ordinary members see
  // the people + agents groups only.
  const invitationsQuery = useWorkspaceInvitationsQuery({
    enabled: enabled && capabilities.canInvite,
  });

  const rows = useMemo(() => {
    const next: DirectoryRow[] = [];
    for (const member of membersQuery.members ?? []) {
      next.push({
        id: `person:${member.userId}`,
        kind: 'person',
        sortName: normalize(member.user?.fullName || member.user?.username || member.user?.email),
        value: member,
      });
    }
    // Workspace agents are execution agents — not OAuth applications. The
    // directory has no real applications source yet, so the group stays
    // absent rather than faking one out of the agent roster.
    for (const agent of agentsQuery.data ?? []) {
      next.push({
        id: `agent:${agent.id}`,
        kind: 'agent',
        sortName: normalize(agent.name),
        value: agent,
      });
    }
    for (const invitation of invitationsQuery.data ?? []) {
      if (invitation.status === 'accepted' || invitation.status === 'revoked') continue;
      next.push({
        id: `invitation:${invitation.id}`,
        kind: 'invitation',
        sortName: normalize(invitation.email),
        value: invitation,
      });
    }
    return next.sort((a, b) => a.sortName.localeCompare(b.sortName));
  }, [membersQuery.members, agentsQuery.data, invitationsQuery.data]);

  const needle = normalize(query).trim();
  const visible = useMemo(
    () =>
      rows.filter((row) => {
        if (groupFilter !== 'all' && row.kind !== groupFilter) return false;
        if (!needle) return true;
        const haystack =
          row.kind === 'person'
            ? normalize(row.value.user?.email) + normalize(row.value.user?.username)
            : '';
        return row.sortName.includes(needle) || haystack.includes(needle);
      }),
    [groupFilter, needle, rows],
  );

  const groups = useMemo(
    () =>
      (
        [
          ['person', t('members.groupPeople', { ns: 'common' })],
          ['agent', t('members.groupAgents', { ns: 'common' })],
          ['invitation', t('members.groupInvitations', { ns: 'common' })],
        ] as const
      )
        .map(([kind, label]) => ({
          kind,
          label,
          rows: visible.filter((r) => r.kind === kind),
        }))
        .filter((group) => group.rows.length > 0),
    [t, visible],
  );

  const settingsPath = workspace
    ? buildWorkspaceAwarePath('/settings/members', workspace.slug)
    : '/settings/members';

  const columns = useMemo<LiteTableColumn<DirectoryRow>[]>(
    () => [
      {
        key: 'name',
        listSlot: 'title',
        render: (row) => {
          const { avatar, name, secondary, role } =
            row.kind === 'person'
              ? {
                  avatar: row.value.user?.avatar,
                  name:
                    row.value.user?.fullName ||
                    row.value.user?.username ||
                    row.value.user?.email ||
                    undefined,
                  role: row.value.role,
                  secondary: row.value.user?.email,
                }
              : row.kind === 'agent'
                ? {
                    avatar: row.value.avatar,
                    name: row.value.name,
                    role: undefined,
                    secondary: row.value.maintainer?.name
                      ? t('members.maintainedBy', {
                          name: row.value.maintainer.name,
                          ns: 'common',
                        })
                      : undefined,
                  }
                : {
                    avatar: null,
                    name: row.value.email,
                    role: row.value.role,
                    secondary: row.value.inviter?.name
                      ? t('members.invitedBy', {
                          name: row.value.inviter.name,
                          ns: 'common',
                        })
                      : undefined,
                  };
          return (
            <div className={styles.cell}>
              <Avatar avatar={avatar} size={28} title={name} />
              <div style={{ minWidth: 0 }}>
                <Flexbox horizontal align={'center'} gap={8}>
                  <div className={styles.name}>{name}</div>
                  {role ? (
                    <Tag color={roleColor[role]} style={{ flex: 'none' }}>
                      {role}
                    </Tag>
                  ) : null}
                  {row.kind === 'person' && row.value.role === 'owner' ? (
                    <Tooltip title={t('members.ownerHint', { ns: 'common' })}>
                      <Icon icon={Crown} size={14} style={{ color: cssVar.colorWarning }} />
                    </Tooltip>
                  ) : null}
                </Flexbox>
                {secondary ? <div className={styles.meta}>{secondary}</div> : null}
              </div>
            </div>
          );
        },
        title: t('members.column.name', { ns: 'common' }),
      },
      {
        key: 'status',
        render: (row) => {
          if (row.kind === 'person') {
            const status = memberStatus(row.value);
            if (status === 'suspended') {
              return <Tag color="orange">{t('members.statusSuspended', { ns: 'common' })}</Tag>;
            }
            if (status === 'removed') {
              return <Tag>{t('members.statusRemoved', { ns: 'common' })}</Tag>;
            }
            return <Text type={'secondary'}>{t('members.statusActive', { ns: 'common' })}</Text>;
          }
          if (row.kind === 'agent') {
            return row.value.status === 'disabled' ? (
              <Tag color="orange">{t('members.statusDisabled', { ns: 'common' })}</Tag>
            ) : (
              <Text type={'secondary'}>{t('members.statusActive', { ns: 'common' })}</Text>
            );
          }
          const expired = row.value.status === 'expired';
          return (
            <Tag color={expired ? 'orange' : 'blue'}>
              {expired
                ? t('members.statusExpired', { ns: 'common' })
                : t('members.statusPending', { ns: 'common' })}
            </Tag>
          );
        },
        title: t('members.column.status', { ns: 'common' }),
        width: 110,
      },
      {
        key: 'joined',
        render: (row) => (
          <Text fontSize={13} type={'secondary'}>
            {formatDate(row.kind === 'person' ? row.value.joinedAt : undefined)}
          </Text>
        ),
        title: t('members.column.joined', { ns: 'common' }),
        width: 120,
      },
      {
        // No member→team join exists in the teammates contract yet; `—` stays
        // honest instead of borrowing project counts into a teams column.
        key: 'teams',
        render: () => <Text type={'secondary'}>—</Text>,
        title: t('members.column.teams', { ns: 'common' }),
        width: 110,
      },
      {
        // No presence source exists; `—` rather than a fake "Online".
        key: 'lastSeen',
        render: () => <Text type={'secondary'}>—</Text>,
        title: t('members.column.lastSeen', { ns: 'common' }),
        width: 110,
      },
      {
        key: 'menu',
        listSlot: 'actions',
        render: (row) => {
          if (row.kind === 'person') {
            const canManage = capabilities.canManageMembers && row.value.userId !== callerUserId;
            return canManage ? (
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
                <ActionIcon
                  icon={MoreHorizontal}
                  size={'small'}
                  title={t('members.manageInSettings', { ns: 'common' })}
                />
              </DropdownMenu>
            ) : null;
          }
          if (row.kind === 'invitation' && capabilities.canInvite) {
            return (
              <DropdownMenu
                items={[
                  {
                    icon: <Icon icon={RefreshCw} size={14} />,
                    key: 'resend',
                    label: t('members.resendInvitation', { ns: 'common' }),
                    onClick: () => void resendInvitation(row.value.id),
                  },
                  {
                    danger: true,
                    icon: <Icon icon={Trash2} size={14} />,
                    key: 'revoke',
                    label: t('members.revokeInvitation', { ns: 'common' }),
                    onClick: () => void revokeInvitation(row.value.id),
                  },
                ]}
              >
                <ActionIcon
                  icon={MoreHorizontal}
                  size={'small'}
                  title={t('inbox.moreActions', { ns: 'notification' })}
                />
              </DropdownMenu>
            );
          }
          return null;
        },
        title: '',
        width: 48,
      },
    ],
    [callerUserId, capabilities, navigate, resendInvitation, revokeInvitation, settingsPath, t],
  );

  const loading =
    membersQuery.isLoading || (enabled && agentsQuery.isLoading) || invitationsQuery.isLoading;
  const loadError = membersQuery.error || agentsQuery.error || invitationsQuery.error;

  return (
    <WorkSurface>
      <NavHeader
        left={
          <Text style={{ paddingInlineStart: 4 }} weight={500}>
            {t('members.title', { ns: 'common' })}
          </Text>
        }
        right={
          <Flexbox horizontal align={'center'} gap={8}>
            {capabilities.canManageMembers ? (
              <Tooltip title={t('members.manageInSettings', { ns: 'common' })}>
                <ActionIcon
                  icon={Settings2}
                  size={'small'}
                  title={t('members.manageInSettings', { ns: 'common' })}
                  onClick={() => navigate(settingsPath)}
                />
              </Tooltip>
            ) : null}
            {capabilities.canInvite ? (
              <Button
                icon={<Icon icon={UserPlus} size={16} />}
                size={'small'}
                type="primary"
                onClick={() => openInviteTeammateModal()}
              >
                {t('workspaceSetting.members.inviteButton', { ns: 'setting' })}
              </Button>
            ) : null}
          </Flexbox>
        }
      />
      <WorkSurfaceCollection
        toolbar={
          <WorkSurfaceToolbar
            asideLabel={t('members.filter', { ns: 'common' })}
            aside={
              <Segmented
                block
                size={'small'}
                value={groupFilter}
                options={[
                  { label: t('members.filterAll', { ns: 'common' }), value: 'all' },
                  { label: t('members.groupPeople', { ns: 'common' }), value: 'person' },
                  { label: t('members.groupAgents', { ns: 'common' }), value: 'agent' },
                  { label: t('members.groupInvitations', { ns: 'common' }), value: 'invitation' },
                ]}
                onChange={(value) => setGroupFilter(value as DirectoryFilter)}
              />
            }
          >
            <SearchBar
              allowClear
              placeholder={t('members.searchPlaceholder', { ns: 'common' })}
              style={{ maxWidth: 280 }}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </WorkSurfaceToolbar>
        }
      >
        {!workspace ? (
          <Center padding={48}>
            <Empty description={t('workspaceSetting.members.noWorkspace', { ns: 'setting' })} />
          </Center>
        ) : loadError ? (
          <Center padding={48}>
            <Empty description={t('workspaceSetting.members.loadFailed', { ns: 'setting' })} />
          </Center>
        ) : loading ? (
          <LiteTable loading columns={columns} dataSource={[]} rowKey={() => 'loading'} />
        ) : groups.length === 0 ? (
          <Center padding={48}>
            <Empty
              description={
                needle || groupFilter !== 'all'
                  ? t('members.emptySearch', { ns: 'common' })
                  : t('workspaceSetting.members.empty', { ns: 'setting' })
              }
            />
          </Center>
        ) : (
          groups.map((group) => (
            <section key={group.kind}>
              <div className={styles.groupLabel}>
                {group.label} · {group.rows.length}
              </div>
              <LiteTable columns={columns} dataSource={group.rows} rowKey={(row) => row.id} />
            </section>
          ))
        )}
      </WorkSurfaceCollection>
    </WorkSurface>
  );
});

MembersPage.displayName = 'MembersPage';

export default MembersPage;
