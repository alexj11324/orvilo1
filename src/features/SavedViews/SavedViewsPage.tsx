'use client';

import { Center, Flexbox, Icon } from '@lobehub/ui';
import { ActionIcon, Button, Popover, Select, Switch, Text } from '@lobehub/ui/base-ui';
import type { SavedViewItem } from '@orvilo/database/schemas';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import { ListTodoIcon, PlusIcon, Settings2Icon } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import LiteTable, { type LiteTableColumn, type LiteTableSection } from '@/components/LiteTable';
import NavHeader from '@/features/NavHeader';
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { WorkSurface, WorkSurfaceCollection, WorkSurfaceToolbar } from '@/features/WorkSurface';
import { useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { workAttentionService } from '@/services/workAttention';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import NewViewModal from './NewViewModal';
import {
  filterSavedViewsByEntity,
  readSavedViewDirectoryPrefs,
  type SavedViewDirectoryPrefs,
  savedViewSectionKey,
  sortSavedViewDirectory,
  viewEntityFromSearch,
  writeSavedViewDirectoryPrefs,
} from './savedViewDirectory';
import { savedViewTitle } from './savedViewTitle';

const styles = createStaticStyles(({ css }) => ({
  directoryTable: css`
    width: calc(100% + 32px);
    margin-block-start: -12px;
    margin-inline: -16px;

    thead th {
      padding-block: 2px;
      background: transparent;
    }

    table tr th:first-child,
    table tr td:first-child {
      padding-inline-start: 18px;
    }

    tbody tr[data-list-section] td {
      padding-block: 3px;
      padding-inline: 8px;
    }

    tbody tr:not([data-list-section]) td {
      padding-block: 15px;
    }
  `,
  displayPopover: css`
    width: 240px;
    padding: 12px;
  `,
  emptyBlock: css`
    display: flex;
    flex-direction: column;
    gap: 14px;
    align-items: flex-start;

    width: 340px;
  `,
  entityTab: css`
    display: inline-flex;
    align-items: center;

    height: 28px;
    padding-inline: 10px;
    border-radius: 9999px;

    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextSecondary};
    text-decoration: none;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillTertiary};
    }
  `,
  entityTabActive: css`
    color: ${cssVar.colorText};
    background: ${cssVar.colorFillSecondary};
  `,
  groupLabel: css`
    display: flex;
    gap: 8px;
    align-items: center;

    min-height: 36px;
    padding-inline: 8px;
    border-radius: 8px;

    font-size: 13px;
    font-weight: 500;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillTertiary};
  `,
  groupCreate: css`
    margin-inline-start: auto;
  `,
  groupDescription: css`
    color: ${cssVar.colorTextSecondary};
  `,
  groupTitle: css`
    color: ${cssVar.colorText};
  `,
  nameCell: css`
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
  `,
  name: css`
    overflow: hidden;

    font-size: 14px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  nameLink: css`
    overflow: hidden;
    min-width: 0;
    color: inherit;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  `,
  ownerCell: css`
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
  `,
}));

const viewIcon = (view: SavedViewItem) =>
  view.entityType === 'project' ? PROJECT_ENTITY_ICON : ListTodoIcon;

const renderDateCell = (value: Date | string | null | undefined) =>
  value ? (
    <Text fontSize={13} title={dayjs(value).format('YYYY-MM-DD HH:mm')} type={'secondary'}>
      {dayjs(value).fromNow()}
    </Text>
  ) : (
    <Text type={'secondary'}>—</Text>
  );

const DIRECTORY_DOC_URL = '/docs/usage/getting-started/work';

/**
 * `/views` — the saved-views directory. One table with a shared header and
 * visibility sections (`Personal views · Only visible to you` first), matching
 * the reference column model Name/Owner plus opt-in Created/Updated property
 * columns behind Display options. Virtual built-ins never appear here (R2) —
 * they only resolve by id for deep links and favorites.
 */
const SavedViewsPage = memo(() => {
  const { t } = useTranslation('common');
  const location = useLocation();
  const entityType = viewEntityFromSearch(location.search);
  const workspaceId = useActiveWorkspaceId();
  const navigate = useWorkspaceAwareNavigate();
  const currentUserId = useUserStore(userProfileSelectors.userId);
  const currentUserName = useUserStore(userProfileSelectors.displayUserName);
  const currentUserAvatar = useUserStore(userProfileSelectors.userAvatar);
  const { members } = useWorkspaceMembersQuery();
  const [creating, setCreating] = useState(false);
  const [prefs, setPrefs] = useState<SavedViewDirectoryPrefs>(() =>
    readSavedViewDirectoryPrefs(workspaceId, entityType),
  );
  const {
    data,
    error,
    isLoading,
    mutate: revalidate,
  } = useClientDataSWR(workAttentionKeys.savedViews(workspaceId), () =>
    workAttentionService.savedViewList(),
  );
  const views = useMemo(() => data?.data ?? [], [data?.data]);

  // Display options persist per workspace+entity tab; re-read when either
  // scope changes so switching tabs never leaks the other tab's choices,
  // and write back whenever the state actually changes.
  useEffect(() => {
    setPrefs(readSavedViewDirectoryPrefs(workspaceId, entityType));
  }, [workspaceId, entityType]);

  useEffect(() => {
    writeSavedViewDirectoryPrefs(workspaceId, entityType, prefs);
  }, [entityType, prefs, workspaceId]);

  const updatePrefs = useCallback((patch: Partial<SavedViewDirectoryPrefs>) => {
    setPrefs((current) => ({ ...current, ...patch }));
  }, []);

  const memberByUserId = useMemo(() => {
    const map = new Map<string, { avatar?: string; name: string }>();
    for (const member of members ?? []) {
      const name = member.user?.fullName || member.user?.username || member.user?.email || '';
      map.set(member.userId, { avatar: member.user?.avatar ?? undefined, name });
    }
    return map;
  }, [members]);

  /** SavedViewItem carries `ownerUserId` but no display name — resolve through
      the workspace roster, falling back to the visitor's own profile. */
  const ownerInfo = useCallback(
    (view: SavedViewItem): { avatar?: string; name: string } => {
      if (view.ownerUserId === currentUserId) {
        return { avatar: currentUserAvatar || undefined, name: currentUserName };
      }
      return memberByUserId.get(view.ownerUserId) ?? { name: '' };
    },
    [currentUserAvatar, currentUserId, currentUserName, memberByUserId],
  );

  const filteredViews = useMemo(() => {
    return filterSavedViewsByEntity(views, entityType, '', (view) =>
      savedViewTitle(view.id, view.name, t),
    );
  }, [entityType, t, views]);

  const sections = useMemo<LiteTableSection<SavedViewItem>[]>(() => {
    const sort = (list: SavedViewItem[]) =>
      sortSavedViewDirectory(list, prefs, {
        ownerName: (view) => ownerInfo(view).name,
        title: (view) => savedViewTitle(view.id, view.name, t),
      });
    const personal = sort(filteredViews.filter((view) => savedViewSectionKey(view) === 'personal'));
    const shared = sort(filteredViews.filter((view) => savedViewSectionKey(view) === 'shared'));
    return [
      {
        // The reference places create at the right edge of the group heading.
        header: (
          <div className={styles.groupLabel}>
            <Avatar avatar={currentUserAvatar || undefined} name={currentUserName} size={20} />
            <span className={styles.groupTitle}>
              {t('savedViews.sectionPersonal')}
              <span className={styles.groupDescription}>
                {' · '}
                {t('savedViews.sectionPersonalDesc')}
              </span>
            </span>
            <ActionIcon
              className={styles.groupCreate}
              icon={PlusIcon}
              size="small"
              aria-label={t(
                entityType === 'project'
                  ? 'savedViews.createPrivateProjectView'
                  : 'savedViews.createPrivateIssueView',
              )}
              onClick={() => setCreating(true)}
            />
          </div>
        ),
        items: personal,
        key: 'personal',
      },
      ...(shared.length > 0
        ? [
            {
              header: (
                <div className={styles.groupLabel}>
                  <span className={styles.groupTitle}>
                    {t('savedViews.sectionShared')}
                    <span className={styles.groupDescription}>
                      {' · '}
                      {t('savedViews.sectionSharedDesc')}
                    </span>
                  </span>
                </div>
              ),
              items: shared,
              key: 'shared',
            },
          ]
        : []),
    ];
  }, [currentUserAvatar, currentUserName, entityType, filteredViews, ownerInfo, prefs, t]);

  const columns = useMemo<LiteTableColumn<SavedViewItem>[]>(() => {
    const list: LiteTableColumn<SavedViewItem>[] = [
      {
        key: 'name',
        listSlot: 'title',
        render: (view) => (
          <div className={styles.nameCell}>
            <Icon color={cssVar.colorTextSecondary} icon={viewIcon(view)} size={16} />
            {/* A real anchor keeps open-in-new-tab and middle-click working;
                stopPropagation keeps the row's own onRowClick from
                double-navigating. */}
            <WorkspaceLink
              className={styles.nameLink}
              to={`/views/${view.id}`}
              onClick={(event) => event.stopPropagation()}
            >
              <span className={styles.name}>{savedViewTitle(view.id, view.name, t)}</span>
            </WorkspaceLink>
          </div>
        ),
        title: t('savedViews.column.name'),
      },
    ];
    if (prefs.showOwner) {
      list.push({
        key: 'owner',
        render: (view) => {
          const owner = ownerInfo(view);
          if (!owner.name) return <Text type={'secondary'}>—</Text>;
          return (
            <div className={styles.ownerCell}>
              <Avatar avatar={owner.avatar} name={owner.name} size={20} />
              <Text ellipsis fontSize={13}>
                {owner.name}
              </Text>
            </div>
          );
        },
        title: t('savedViews.column.owner'),
        width: 153,
      });
    }
    if (prefs.showCreated) {
      list.push({
        key: 'created',
        render: (view) => renderDateCell(view.createdAt),
        title: t('savedViews.column.created'),
        width: 140,
      });
    }
    if (prefs.showUpdated) {
      list.push({
        key: 'updated',
        render: (view) => renderDateCell(view.updatedAt),
        title: t('savedViews.column.updated'),
        width: 140,
      });
    }
    return list;
  }, [ownerInfo, prefs.showCreated, prefs.showOwner, prefs.showUpdated, t]);

  const displayOptions = (
    <Popover
      placement="bottomRight"
      trigger="click"
      content={
        <Flexbox className={styles.displayPopover} gap={10}>
          <Text fontSize={12} type="secondary" weight={500}>
            {t('savedViews.ordering')}
          </Text>
          <Select
            aria-label={t('savedViews.ordering')}
            size="small"
            style={{ width: '100%' }}
            value={prefs.ordering}
            options={(['name', 'owner', 'updated', 'created'] as const).map((value) => ({
              label: t(`savedViews.column.${value}` as never),
              value,
            }))}
            onChange={(value) => {
              if (
                value === 'name' ||
                value === 'owner' ||
                value === 'updated' ||
                value === 'created'
              )
                updatePrefs({ ordering: value });
            }}
          />
          <Select
            aria-label={t('savedViews.direction')}
            size="small"
            style={{ width: '100%' }}
            value={prefs.direction}
            options={(['asc', 'desc'] as const).map((value) => ({
              label: t(`savedViews.direction.${value}` as never),
              value,
            }))}
            onChange={(value) => {
              if (value === 'asc' || value === 'desc') updatePrefs({ direction: value });
            }}
          />
          <Text fontSize={12} type="secondary" weight={500}>
            {t('savedViews.displayProperties')}
          </Text>
          {(
            [
              ['showOwner', 'savedViews.column.owner'],
              ['showCreated', 'savedViews.column.created'],
              ['showUpdated', 'savedViews.column.updated'],
            ] as const
          ).map(([key, labelKey]) => (
            <Flexbox horizontal align="center" justify="space-between" key={key}>
              <Text fontSize={13}>{t(labelKey)}</Text>
              <Switch
                checked={prefs[key]}
                size="small"
                onChange={(checked) => updatePrefs({ [key]: checked })}
              />
            </Flexbox>
          ))}
        </Flexbox>
      }
    >
      <ActionIcon
        aria-label={t('savedViews.displayOptions')}
        icon={Settings2Icon}
        size="small"
        title={t('savedViews.displayOptions')}
      />
    </Popover>
  );

  return (
    <WorkSurface>
      <NavHeader
        left={
          <Text style={{ paddingInlineStart: 4 }} weight={500}>
            {t('tab.views')}
          </Text>
        }
        right={
          <Button
            icon={<Icon icon={PlusIcon} size={16} />}
            size={'small'}
            type="text"
            onClick={() => setCreating(true)}
          >
            {t('savedViews.newView')}
          </Button>
        }
      />
      <WorkSurfaceCollection
        toolbar={
          <WorkSurfaceToolbar>
            <Flexbox horizontal align="center" gap={6}>
              <WorkspaceLink
                aria-current={entityType === 'task' ? 'page' : undefined}
                className={`${styles.entityTab} ${entityType === 'task' ? styles.entityTabActive : ''}`}
                to="/views"
              >
                {t('savedViews.tabIssues')}
              </WorkspaceLink>
              <WorkspaceLink
                aria-current={entityType === 'project' ? 'page' : undefined}
                className={`${styles.entityTab} ${entityType === 'project' ? styles.entityTabActive : ''}`}
                to="/views?entity=project"
              >
                {t('savedViews.entityProject')}
              </WorkspaceLink>
            </Flexbox>
            <div style={{ marginInlineStart: 'auto' }}>{displayOptions}</div>
          </WorkSurfaceToolbar>
        }
      >
        {error ? (
          <AsyncError error={error} onRetry={() => revalidate()} />
        ) : isLoading && views.length === 0 ? (
          <LiteTable loading columns={columns} dataSource={[]} rowKey={() => 'loading'} />
        ) : filteredViews.length === 0 ? (
          /* Reference empty state: left-aligned block, 340px wide,
               horizontally centered. The ⌥V shortcut line is intentionally
               absent — Orvilo has no such hotkey (honest UI over copied
               chrome). */
          <Center flex={1} padding={48}>
            <div className={styles.emptyBlock}>
              <Icon color={cssVar.colorTextTertiary} icon={ListTodoIcon} size={56} />
              <Text fontSize={15} weight={600}>
                {t('tab.views')}
              </Text>
              <Text fontSize={13} type="secondary">
                {t(
                  entityType === 'project'
                    ? 'teams.viewDirectoryDescriptionProjects'
                    : 'teams.viewDirectoryDescriptionIssues',
                )}
              </Text>
              <Flexbox horizontal gap={8}>
                <Button
                  icon={<Icon icon={PlusIcon} size={14} />}
                  size="small"
                  type="primary"
                  onClick={() => setCreating(true)}
                >
                  {t('teams.viewCreateNew')}
                </Button>
                <Button
                  size="small"
                  onClick={() => window.open(DIRECTORY_DOC_URL, '_blank', 'noopener,noreferrer')}
                >
                  {t('teams.viewDocumentation')}
                </Button>
              </Flexbox>
            </div>
          </Center>
        ) : (
          <LiteTable
            className={styles.directoryTable}
            columns={columns}
            rowKey={(view) => view.id}
            sections={sections}
            onRowClick={(view) => navigate(`/views/${view.id}`)}
          />
        )}
      </WorkSurfaceCollection>
      <NewViewModal
        defaultEntityType={entityType}
        open={creating}
        onClose={() => setCreating(false)}
      />
    </WorkSurface>
  );
});

SavedViewsPage.displayName = 'SavedViewsPage';

export default SavedViewsPage;
