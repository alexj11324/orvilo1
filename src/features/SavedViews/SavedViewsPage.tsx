'use client';

import { Center, Empty, Flexbox, Icon, SearchBar } from '@lobehub/ui';
import { ActionIcon, Button, confirmModal, Tag, Text, toast } from '@lobehub/ui/base-ui';
import type { SavedViewItem } from '@orvilo/database/schemas';
import { builtinSavedViewKey } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import {
  Columns3Icon,
  FolderClosedIcon,
  ListIcon,
  ListTodoIcon,
  PlusIcon,
  SearchXIcon,
  Trash2Icon,
} from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import NavHeader from '@/features/NavHeader';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import WideScreenContainer from '@/features/WideScreenContainer';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { workAttentionService } from '@/services/workAttention';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import NewViewModal from './NewViewModal';
import { savedViewTitle } from './savedViewTitle';

const styles = createStaticStyles(({ css }) => ({
  actions: css`
    flex: none;
    opacity: 0;
    transition: opacity ${cssVar.motionDurationFast};

    @media (hover: none) {
      opacity: 1;
    }
  `,
  link: css`
    display: flex;
    flex: 1;
    gap: 12px;
    align-items: center;

    min-width: 0;

    color: inherit;
  `,
  meta: css`
    flex: none;
    color: ${cssVar.colorTextQuaternary};
    text-align: end;
    white-space: nowrap;
  `,
  row: css`
    padding-block: 8px;
    padding-inline: 8px 12px;
    border-radius: ${cssVar.borderRadiusLG};

    color: inherit;

    transition: background ${cssVar.motionDurationFast};

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }

    &:hover .saved-view-row-actions,
    &:focus-within .saved-view-row-actions {
      opacity: 1;
    }
  `,
  sectionLabel: css`
    padding-block: 8px 4px;
    padding-inline: 8px;
    font-size: ${cssVar.fontSizeSM};
    color: ${cssVar.colorTextQuaternary};
  `,
}));

const viewIcon = (view: SavedViewItem) =>
  view.entityType === 'project' ? FolderClosedIcon : ListTodoIcon;

const ViewRow = memo<{
  deletable: boolean;
  onDelete: (view: SavedViewItem) => void;
  view: SavedViewItem;
}>(({ deletable, onDelete, view }) => {
  const { t } = useTranslation('common');

  return (
    <Flexbox horizontal align={'center'} className={styles.row}>
      <WorkspaceLink className={styles.link} to={`/views/${view.id}`}>
        <Icon color={cssVar.colorTextSecondary} icon={viewIcon(view)} size={16} />
        <Flexbox flex={1} style={{ minWidth: 0 }}>
          <Text ellipsis weight={500}>
            {savedViewTitle(view.id, view.name, t)}
          </Text>
        </Flexbox>
        <Icon
          color={cssVar.colorTextQuaternary}
          icon={view.layout === 'board' ? Columns3Icon : ListIcon}
          size={14}
          title={t(view.layout === 'board' ? 'savedViews.layoutBoard' : 'savedViews.layoutList')}
        />
        {!builtinSavedViewKey(view.id) && view.visibility === 'team' ? (
          <Tag>{t('savedViews.visibilityTeam')}</Tag>
        ) : null}
        {!builtinSavedViewKey(view.id) && view.visibility === 'workspace' ? (
          <Tag>{t('savedViews.visibilityWorkspace')}</Tag>
        ) : null}
        {view.updatedAt ? (
          <Text
            className={styles.meta}
            fontSize={12}
            title={dayjs(view.updatedAt).format('YYYY-MM-DD HH:mm')}
          >
            {dayjs(view.updatedAt).fromNow()}
          </Text>
        ) : null}
      </WorkspaceLink>
      {deletable ? (
        <span className={`${styles.actions} saved-view-row-actions`}>
          <ActionIcon
            icon={Trash2Icon}
            size={'small'}
            title={t('savedViews.delete')}
            onClick={() => onDelete(view)}
          />
        </span>
      ) : null}
    </Flexbox>
  );
});

ViewRow.displayName = 'ViewRow';

/**
 * Views are retrieval objects — the page answers "where is the thing I saved?"
 * Grouping by provenance (built-in / mine / shared) matches how a user recalls
 * a view ("I made it" vs "it's a workspace view") better than one flat list.
 */
const ViewSection = memo<{
  label: string;
  onDelete: (view: SavedViewItem) => void;
  ownerUserId?: string;
  views: SavedViewItem[];
}>(({ label, onDelete, ownerUserId, views }) => {
  if (views.length === 0) return null;
  return (
    <Flexbox>
      <Text className={styles.sectionLabel}>{label}</Text>
      <Flexbox gap={2}>
        {views.map((view) => (
          <ViewRow
            deletable={!builtinSavedViewKey(view.id) && view.ownerUserId === ownerUserId}
            key={view.id}
            view={view}
            onDelete={onDelete}
          />
        ))}
      </Flexbox>
    </Flexbox>
  );
});

ViewSection.displayName = 'ViewSection';

const SavedViewsPage = memo(() => {
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
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

  const [builtinViews, mine, shared] = useMemo(() => {
    const builtinList: SavedViewItem[] = [];
    const mineList: SavedViewItem[] = [];
    const sharedList: SavedViewItem[] = [];
    for (const view of filteredViews) {
      if (builtinSavedViewKey(view.id)) builtinList.push(view);
      else if (view.ownerUserId === ownerUserId) mineList.push(view);
      else sharedList.push(view);
    }
    return [builtinList, mineList, sharedList];
  }, [filteredViews, ownerUserId]);

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

  return (
    <Flexbox flex={1} height="100%">
      <NavHeader
        left={
          <Text style={{ paddingInlineStart: 4 }} weight={500}>
            {t('tab.views')}
          </Text>
        }
      />
      <WideScreenContainer gap={16} paddingBlock={16} wrapperStyle={{ flex: 1, overflowY: 'auto' }}>
        <Flexbox horizontal align={'center'} gap={12} justify={'space-between'}>
          <SearchBar
            allowClear
            placeholder={t('savedViews.searchPlaceholder')}
            style={{ maxWidth: 280 }}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <Button icon={PlusIcon} type="primary" onClick={() => setCreating(true)}>
            {t('savedViews.newView')}
          </Button>
        </Flexbox>
        {error ? (
          <AsyncError error={error} onRetry={() => revalidate()} />
        ) : isLoading && views.length === 0 ? (
          <SkeletonList rows={8} />
        ) : filteredViews.length === 0 ? (
          <Center flex={1} padding={48}>
            <Empty
              description={keyword.trim() ? t('savedViews.searchEmpty') : t('savedViews.empty')}
              icon={keyword.trim() ? SearchXIcon : ListTodoIcon}
            />
          </Center>
        ) : (
          <Flexbox gap={16}>
            <ViewSection
              label={t('savedViews.sectionBuiltin')}
              views={builtinViews}
              onDelete={deleteView}
            />
            <ViewSection
              label={t('savedViews.sectionMine')}
              ownerUserId={ownerUserId}
              views={mine}
              onDelete={deleteView}
            />
            <ViewSection
              label={t('savedViews.sectionShared')}
              ownerUserId={ownerUserId}
              views={shared}
              onDelete={deleteView}
            />
          </Flexbox>
        )}
      </WideScreenContainer>
      <NewViewModal open={creating} onClose={() => setCreating(false)} />
    </Flexbox>
  );
});

SavedViewsPage.displayName = 'SavedViewsPage';

export default SavedViewsPage;
