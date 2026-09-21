'use client';

import { Center, Empty, Flexbox, Icon, SearchBar } from '@lobehub/ui';
import {
  ActionIcon,
  Button,
  confirmModal,
  DropdownMenu,
  Tag,
  Text,
  toast,
} from '@lobehub/ui/base-ui';
import type { SavedViewItem } from '@orvilo/database/schemas';
import { builtinSavedViewKey } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import {
  Columns3Icon,
  FolderClosedIcon,
  ListIcon,
  ListTodoIcon,
  MoreHorizontal,
  PlusIcon,
  SearchXIcon,
  Trash2Icon,
} from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import LiteTable, { type LiteTableColumn } from '@/components/LiteTable';
import NavHeader from '@/features/NavHeader';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { WorkSurface, WorkSurfaceCollection, WorkSurfaceToolbar } from '@/features/WorkSurface';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { workAttentionService } from '@/services/workAttention';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import NewViewModal from './NewViewModal';
import { savedViewTitle } from './savedViewTitle';
import { savedViewVisibilityKey } from './savedViewVisibility';

const styles = createStaticStyles(({ css }) => ({
  groupLabel: css`
    padding-block: 12px 4px;

    font-size: 12px;
    font-weight: 600;
    color: ${cssVar.colorTextTertiary};
    text-transform: uppercase;
    letter-spacing: 0.04em;
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
}));

const viewIcon = (view: SavedViewItem) =>
  view.entityType === 'project' ? FolderClosedIcon : ListTodoIcon;

/**
 * `/views` — the saved-views directory. A read surface listing every view the
 * workspace exposes behind one searchable table; the same columns hold for
 * built-in, own, and shared rows. Grouping by provenance (built-in / mine /
 * shared) matches how a user recalls a view ("I made it" vs "it's a workspace
 * view") better than one flat list.
 */
const SavedViewsPage = memo(() => {
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const navigate = useWorkspaceAwareNavigate();
  const ownerUserId = useUserStore(userProfileSelectors.userId);
  const [keyword, setKeyword] = useState('');
  const [creating, setCreating] = useState(false);
  const {
    data,
    error,
    isLoading,
    mutate: revalidate,
  } = useClientDataSWR(workAttentionKeys.savedViews(workspaceId), () =>
    workAttentionService.savedViewList(),
  );
  const views = useMemo(() => data?.data ?? [], [data?.data]);

  const filteredViews = useMemo(() => {
    const needle = keyword.trim().toLocaleLowerCase();
    return needle
      ? views.filter((view) =>
          savedViewTitle(view.id, view.name, t).toLocaleLowerCase().includes(needle),
        )
      : views;
  }, [keyword, t, views]);

  const groups = useMemo(
    () =>
      (
        [
          ['builtin', t('savedViews.sectionBuiltin')],
          ['mine', t('savedViews.sectionMine')],
          ['shared', t('savedViews.sectionShared')],
        ] as const
      )
        .map(([kind, label]) => ({
          kind,
          label,
          views: filteredViews.filter((view) =>
            kind === 'builtin'
              ? builtinSavedViewKey(view.id)
              : kind === 'mine'
                ? view.ownerUserId === ownerUserId
                : !builtinSavedViewKey(view.id) && view.ownerUserId !== ownerUserId,
          ),
        }))
        .filter((group) => group.views.length > 0),
    [filteredViews, ownerUserId, t],
  );

  const deleteView = useCallback(
    (view: SavedViewItem) => {
      confirmModal({
        cancelText: t('cancel'),
        content: t('savedViews.deleteConfirm', { name: view.name }),
        okButtonProps: { danger: true },
        okText: t('delete'),
        onOk: async () => {
          try {
            await workAttentionService.savedViewDelete(view.id);
            await mutate(workAttentionKeys.savedViews(workspaceId));
          } catch {
            toast.error(t('savedViews.deleteFailed'));
          }
        },
        title: t('savedViews.delete'),
      });
    },
    [t, workspaceId],
  );

  const columns = useMemo<LiteTableColumn<SavedViewItem>[]>(
    () => [
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
      {
        key: 'layout',
        render: (view) => (
          <Flexbox horizontal align={'center'} gap={6}>
            <Icon
              color={cssVar.colorTextQuaternary}
              icon={view.layout === 'board' ? Columns3Icon : ListIcon}
              size={14}
            />
            <Text fontSize={13} type={'secondary'}>
              {t(view.layout === 'board' ? 'savedViews.layoutBoard' : 'savedViews.layoutList')}
            </Text>
          </Flexbox>
        ),
        title: t('savedViews.column.layout'),
        width: 110,
      },
      {
        key: 'sharing',
        render: (view) =>
          builtinSavedViewKey(view.id) ? (
            <Text type={'secondary'}>—</Text>
          ) : (
            <Tag>{t(savedViewVisibilityKey(view.visibility))}</Tag>
          ),
        title: t('savedViews.visibility'),
        width: 130,
      },
      {
        key: 'updated',
        render: (view) =>
          view.updatedAt ? (
            <Text
              fontSize={13}
              title={dayjs(view.updatedAt).format('YYYY-MM-DD HH:mm')}
              type={'secondary'}
            >
              {dayjs(view.updatedAt).fromNow()}
            </Text>
          ) : (
            <Text type={'secondary'}>—</Text>
          ),
        title: t('savedViews.column.updated'),
        width: 120,
      },
      {
        key: 'menu',
        listSlot: 'actions',
        render: (view) =>
          !builtinSavedViewKey(view.id) && view.ownerUserId === ownerUserId ? (
            // Keep the menu out of the row's click-to-open path.
            <span onClick={(event) => event.stopPropagation()}>
              <DropdownMenu
                items={[
                  {
                    danger: true,
                    icon: <Icon icon={Trash2Icon} size={14} />,
                    key: 'delete',
                    label: t('savedViews.delete'),
                    onClick: () => deleteView(view),
                  },
                ]}
              >
                <ActionIcon
                  aria-label={t('savedViews.delete')}
                  icon={MoreHorizontal}
                  size={'small'}
                />
              </DropdownMenu>
            </span>
          ) : null,
        title: '',
        width: 48,
      },
    ],
    [deleteView, ownerUserId, t],
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
            type="primary"
            onClick={() => setCreating(true)}
          >
            {t('savedViews.newView')}
          </Button>
        }
      />
      <WorkSurfaceCollection
        toolbar={
          <WorkSurfaceToolbar>
            <SearchBar
              allowClear
              placeholder={t('savedViews.searchPlaceholder')}
              style={{ maxWidth: 280 }}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </WorkSurfaceToolbar>
        }
      >
        {error ? (
          <AsyncError error={error} onRetry={() => revalidate()} />
        ) : isLoading && views.length === 0 ? (
          <LiteTable loading columns={columns} dataSource={[]} rowKey={() => 'loading'} />
        ) : filteredViews.length === 0 ? (
          <Center flex={1} padding={48}>
            <Empty
              description={keyword.trim() ? t('savedViews.searchEmpty') : t('savedViews.empty')}
              icon={keyword.trim() ? SearchXIcon : ListTodoIcon}
            />
          </Center>
        ) : (
          groups.map((group) => (
            <section key={group.kind}>
              <div className={styles.groupLabel}>
                {group.label} · {group.views.length}
              </div>
              <LiteTable
                columns={columns}
                dataSource={group.views}
                rowKey={(view) => view.id}
                onRowClick={(view) => navigate(`/views/${view.id}`)}
              />
            </section>
          ))
        )}
      </WorkSurfaceCollection>
      <NewViewModal open={creating} onClose={() => setCreating(false)} />
    </WorkSurface>
  );
});

SavedViewsPage.displayName = 'SavedViewsPage';

export default SavedViewsPage;
