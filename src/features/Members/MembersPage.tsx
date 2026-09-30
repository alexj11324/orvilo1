'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { MoreHorizontal, RefreshCw, Settings2, Trash2, UserPlus } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useActiveWorkspace } from '@/business/client/hooks/useActiveWorkspace';
import { useWorkspaceCapabilities } from '@/business/client/hooks/useWorkspaceCapabilities';
import ActionIcon from '@/components/ActionIcon';
import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import DropdownMenu from '@/components/ItemsMenu';
import LiteTable, { type LiteTableColumn, type LiteTableSection } from '@/components/LiteTable';
import { Badge } from '@/components/reui/badge';
import SearchBar from '@/components/SearchBar';
import SimpleEmpty from '@/components/SimpleEmpty';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SimpleTooltip } from '@/components/ui/tooltip';
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
const roleColor: Record<string, 'info-light' | 'primary-light' | 'secondary' | 'warning-light'> = {
  admin: 'primary-light',
  member: 'info-light',
  owner: 'warning-light',
  viewer: 'secondary',
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
            <span className="text-[13px] text-muted-foreground">
              <span className={styles.ellipsis}>{email || '—'}</span>
            </span>
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
              return (
                <Badge variant="warning-light">
                  {t('members.statusSuspended', { ns: 'common' })}
                </Badge>
              );
            }
            if (status === 'removed') {
              return (
                <Badge variant="secondary">{t('members.statusRemoved', { ns: 'common' })}</Badge>
              );
            }
            return (
              <Badge variant={roleColor[row.value.role]}>
                {t(`workspaceSetting.members.role.${row.value.role}`, {
                  defaultValue: row.value.role,
                  ns: 'setting',
                })}
              </Badge>
            );
          }
          if (row.kind === 'agent') {
            return row.value.status === 'disabled' ? (
              <Badge variant="warning-light">{t('members.statusDisabled', { ns: 'common' })}</Badge>
            ) : (
              <span className="text-muted-foreground">
                {t('members.agentLabel', { ns: 'common' })}
              </span>
            );
          }
          if (row.value.status === 'expired') {
            return (
              <Badge variant="warning-light">{t('members.statusExpired', { ns: 'common' })}</Badge>
            );
          }
          return (
            <Badge variant={roleColor[row.value.role]}>
              {t('members.roleInvited', {
                ns: 'common',
                role: t(`workspaceSetting.members.role.${row.value.role}`, {
                  defaultValue: row.value.role,
                  ns: 'setting',
                }),
              })}
            </Badge>
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
            <span className="text-[13px] text-muted-foreground">
              {count === undefined ? '—' : t('members.projectCount', { count, ns: 'common' })}
            </span>
          );
        },
        title: t('members.column.projects', { ns: 'common' }),
        width: 100,
      },
      {
        key: 'joined',
        render: (row) => (
          <span className="text-[13px] text-muted-foreground">
            {formatMemberDate(
              row.kind === 'person'
                ? row.value.joinedAt
                : row.kind === 'invitation'
                  ? row.value.createdAt
                  : undefined,
            )}
          </span>
        ),
        title: t('members.column.joined', { ns: 'common' }),
        width: 110,
      },
      {
        // No presence source exists; `—` rather than a fake "Online".
        key: 'lastSeen',
        render: () => <span className="text-muted-foreground">—</span>,
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
                    icon: (
                      <span className="anticon" role="img">
                        <Settings2 fill={'transparent'} height={14} size={14} width={14} />
                      </span>
                    ),
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
                    icon: (
                      <span className="anticon" role="img">
                        <RefreshCw fill={'transparent'} height={14} size={14} width={14} />
                      </span>
                    ),
                    key: 'resend',
                    label: t('members.resendInvitation', { ns: 'common' }),
                    onClick: () => void resendInvitation(row.value.id),
                  },
                  {
                    danger: true,
                    icon: (
                      <span className="anticon" role="img">
                        <Trash2 fill={'transparent'} height={14} size={14} width={14} />
                      </span>
                    ),
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
          <span className="font-medium" style={{ paddingInlineStart: 4 }}>
            {t('members.title', { ns: 'common' })}
          </span>
        }
        right={
          <div className="flex flex-row items-center gap-2">
            {capabilities.canManageMembers ? (
              <SimpleTooltip title={t('members.manageInSettings', { ns: 'common' })}>
                <ActionIcon
                  aria-label={t('members.manageInSettings', { ns: 'common' })}
                  icon={Settings2}
                  size={'small'}
                  onClick={() => navigate(settingsPath)}
                />
              </SimpleTooltip>
            ) : null}
            {capabilities.canInvite ? (
              <Button size="sm" variant="default" onClick={() => openInviteTeammateModal()}>
                <UserPlus data-icon="inline-start" />
                {t('workspaceSetting.members.inviteButton', { ns: 'setting' })}
              </Button>
            ) : null}
          </div>
        }
      />
      <WorkSurfaceCollection
        toolbar={
          <WorkSurfaceToolbar
            asideLabel={t('members.filter', { ns: 'common' })}
            aside={
              <ToggleGroup
                className="w-full"
                size="sm"
                value={[groupFilter]}
                onValueChange={(value) => value[0] && setGroupFilter(value[0] as DirectoryFilter)}
              >
                <ToggleGroupItem value="all">
                  {t('members.filterAll', { ns: 'common' })}
                </ToggleGroupItem>
                <ToggleGroupItem value="person">
                  {t('members.groupPeople', { ns: 'common' })}
                </ToggleGroupItem>
                <ToggleGroupItem value="agent">
                  {t('members.groupAgents', { ns: 'common' })}
                </ToggleGroupItem>
                <ToggleGroupItem value="invitation">
                  {t('members.groupInvitations', { ns: 'common' })}
                </ToggleGroupItem>
              </ToggleGroup>
            }
          >
            <SearchBar
              placeholder={t('members.searchPlaceholder', { ns: 'common' })}
              style={{ maxWidth: 280 }}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </WorkSurfaceToolbar>
        }
      >
        {!workspace ? (
          <div className="flex flex-col items-center justify-center p-12">
            <SimpleEmpty
              description={t('workspaceSetting.members.noWorkspace', { ns: 'setting' })}
            />
          </div>
        ) : loadError ? (
          /* The directory joins three queries — retry revalidates all of them,
             matching every other surface's AsyncError+retry contract. */
          <div className="flex flex-col items-center justify-center p-12">
            <AsyncError
              error={loadError}
              onRetry={() => {
                void membersQuery.mutate();
                void agentsQuery.mutate();
                void invitationsQuery.mutate();
              }}
            />
          </div>
        ) : loading ? (
          <LiteTable loading columns={columns} dataSource={[]} rowKey={() => 'loading'} />
        ) : sections.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12">
            <SimpleEmpty
              description={
                needle || groupFilter !== 'all'
                  ? t('members.emptySearch', { ns: 'common' })
                  : t('workspaceSetting.members.empty', { ns: 'setting' })
              }
            />
          </div>
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
