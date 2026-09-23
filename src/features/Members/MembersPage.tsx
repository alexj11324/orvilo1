'use client';

import { Center, Empty, Flexbox, Icon, SearchBar, Tooltip } from '@lobehub/ui';
import { ActionIcon, Button, DropdownMenu, Segmented, Tag, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { MoreHorizontal, RefreshCw, Settings2, Trash2, UserPlus } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useActiveWorkspace } from '@/business/client/hooks/useActiveWorkspace';
import { useWorkspaceCapabilities } from '@/business/client/hooks/useWorkspaceCapabilities';
import Avatar from '@/components/Avatar';
import LiteTable, { type LiteTableColumn, type LiteTableSection } from '@/components/LiteTable';
import NavHeader from '@/features/NavHeader';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { WorkSurface, WorkSurfaceCollection, WorkSurfaceToolbar } from '@/features/WorkSurface';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { openInviteTeammateModal } from '../Teammates';
import {
  useTeammateActions,
  useWorkspaceAgentsQuery,
  useWorkspaceInvitationsQuery,
  useWorkspaceMembersQuery,
} from '../Teammates/api/hooks';
import { memberStatus } from '../Teammates/api/roleCapabilities';
import {
  buildDirectoryRows,
  DIRECTORY_SECTION_ORDER,
  type DirectoryFilter,
  type DirectoryRow,
  type DirectorySection,
  directorySectionKey,
  filterDirectoryRows,
} from './directoryRows';
import { formatMemberDate } from './memberDate';

const styles = createStaticStyles(({ css }) => ({
  cell: css`
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
  `,
  directoryTable: css`
    /* Reference bands each lifecycle group under one shared column header. */
    tbody tr[data-list-section] td {
      background: ${cssVar.colorFillQuaternary};
    }

    /* Reference reveals row actions on hover; keep them rendered on coarse
       pointers and whenever the trigger holds keyboard focus. */
    @media (hover: hover) and (pointer: fine) {
      tbody tr:not([data-list-section], :hover, :focus-within) td[data-list-slot='actions'] {
        opacity: 0;
      }
    }
  `,
  ellipsis: css`
    overflow: hidden;
    display: block;

    min-width: 0;
    max-width: 240px;

    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  groupLabel: css`
    font-size: 13px;
    font-weight: 500;
  `,
  groupCount: css`
    margin-inline-start: 6px;
    font-weight: 400;
    color: ${cssVar.colorTextTertiary};
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

const normalize = (value: string | null | undefined) => (value ?? '').toLowerCase();

// Mirrors the role badge palette on /settings/members so the same role reads
// the same color on both member surfaces.
const roleColor: Record<string, string> = {
  admin: 'purple',
  member: 'blue',
  owner: 'gold',
  viewer: 'default',
};

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

  const rows = useMemo(
    () => buildDirectoryRows(membersQuery.members, agentsQuery.data, invitationsQuery.data),
    [membersQuery.members, agentsQuery.data, invitationsQuery.data],
  );

  const needle = normalize(query).trim();
  const visible = useMemo(
    () => filterDirectoryRows(rows, needle, groupFilter),
    [groupFilter, needle, rows],
  );

  const sections = useMemo<LiteTableSection<DirectoryRow>[]>(() => {
    const labels: Record<DirectorySection, string> = {
      active: t('members.statusActive', { ns: 'common' }),
      agent: t('members.groupAgents', { ns: 'common' }),
      invited: t('members.groupInvited', { ns: 'common' }),
      removed: t('members.statusRemoved', { ns: 'common' }),
      suspended: t('members.statusSuspended', { ns: 'common' }),
    };
    return DIRECTORY_SECTION_ORDER.map((key) => ({
      items: visible.filter((row) => directorySectionKey(row) === key),
      key,
      label: labels[key],
    }))
      .filter((section) => section.items.length > 0)
      .map(({ items, key, label }) => ({
        header: (
          <div className={styles.groupLabel}>
            {label}
            <span className={styles.groupCount}>{items.length}</span>
          </div>
        ),
        items,
        key,
      }));
  }, [t, visible]);

  const settingsPath = workspace
    ? buildWorkspaceAwarePath('/settings/members', workspace.slug)
    : '/settings/members';

  const columns = useMemo<LiteTableColumn<DirectoryRow>[]>(
    () => [
      {
        key: 'name',
        listSlot: 'title',
        render: (row) => {
          // Reference secondary line is the username/handle; email moved to
          // its own column. Invitations keep the inviter credit instead.
          const { avatar, name, secondary } =
            row.kind === 'person'
              ? {
                  avatar: row.value.user?.avatar,
                  name:
                    row.value.user?.fullName ||
                    row.value.user?.username ||
                    row.value.user?.email ||
                    undefined,
                  secondary: row.value.user?.fullName
                    ? row.value.user?.username || undefined
                    : undefined,
                }
              : row.kind === 'agent'
                ? {
                    avatar: row.value.avatar,
                    name: row.value.name,
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
                <div className={styles.name}>{name}</div>
                {secondary ? <div className={styles.meta}>{secondary}</div> : null}
              </div>
            </div>
          );
        },
        title: t('members.column.name', { ns: 'common' }),
      },
      {
        key: 'email',
        render: (row) => {
          const email =
            row.kind === 'person'
              ? row.value.user?.email
              : row.kind === 'invitation'
                ? row.value.email
                : null;
          return (
            <Text fontSize={13} type={'secondary'}>
              <span className={styles.ellipsis}>{email || '—'}</span>
            </Text>
          );
        },
        title: t('members.column.email', { ns: 'common' }),
        width: 220,
      },
      {
        // Reference renders the role badge in the Status column — "Admin",
        // "Admin (Invited)", "Application" — so role moved out of the name
        // cell. Suspended/removed/expired keep their own tags; agents read
        // "Agent" like the reference's "Application" label.
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
            return (
              <Tag color={roleColor[row.value.role]}>
                {t(`workspaceSetting.members.role.${row.value.role}`, {
                  defaultValue: row.value.role,
                  ns: 'setting',
                })}
              </Tag>
            );
          }
          if (row.kind === 'agent') {
            return row.value.status === 'disabled' ? (
              <Tag color="orange">{t('members.statusDisabled', { ns: 'common' })}</Tag>
            ) : (
              <Text type={'secondary'}>{t('members.agentLabel', { ns: 'common' })}</Text>
            );
          }
          if (row.value.status === 'expired') {
            return <Tag color="orange">{t('members.statusExpired', { ns: 'common' })}</Tag>;
          }
          return (
            <Tag color={roleColor[row.value.role]}>
              {t('members.roleInvited', {
                ns: 'common',
                role: t(`workspaceSetting.members.role.${row.value.role}`, {
                  defaultValue: row.value.role,
                  ns: 'setting',
                }),
              })}
            </Tag>
          );
        },
        title: t('members.column.status', { ns: 'common' }),
        width: 130,
      },
      {
        // The reference column is "Teams"; the teammates contract carries
        // project memberships instead, so the column is honestly labeled
        // "Projects" and filled with real counts where the backend provides
        // them.
        key: 'projects',
        render: (row) => {
          const count =
            row.kind === 'person'
              ? row.value.projectCount
              : row.kind === 'agent'
                ? row.value.projects?.length
                : undefined;
          return (
            <Text fontSize={13} type={'secondary'}>
              {count === undefined ? '—' : t('members.projectCount', { count, ns: 'common' })}
            </Text>
          );
        },
        title: t('members.column.projects', { ns: 'common' }),
        width: 100,
      },
      {
        key: 'joined',
        render: (row) => (
          <Text fontSize={13} type={'secondary'}>
            {formatMemberDate(
              row.kind === 'person'
                ? row.value.joinedAt
                : row.kind === 'invitation'
                  ? row.value.createdAt
                  : undefined,
            )}
          </Text>
        ),
        title: t('members.column.joined', { ns: 'common' }),
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
                  aria-label={t('members.manageInSettings', { ns: 'common' })}
                  icon={MoreHorizontal}
                  size={'small'}
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
                  aria-label={t('inbox.moreActions', { ns: 'notification' })}
                  icon={MoreHorizontal}
                  size={'small'}
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
                  aria-label={t('members.manageInSettings', { ns: 'common' })}
                  icon={Settings2}
                  size={'small'}
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
        ) : sections.length === 0 ? (
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
          <LiteTable
            className={styles.directoryTable}
            columns={columns}
            rowKey={(row) => row.id}
            sections={sections}
          />
        )}
      </WorkSurfaceCollection>
    </WorkSurface>
  );
});

MembersPage.displayName = 'MembersPage';

export default MembersPage;
