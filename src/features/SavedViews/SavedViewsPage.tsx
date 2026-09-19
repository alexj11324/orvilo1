'use client';

import { Center, Empty, Flexbox, Icon, SearchBar } from '@lobehub/ui';
import { Button, Tag, Text } from '@lobehub/ui/base-ui';
import type { SavedViewItem } from '@orvilo/database/schemas';
import { builtinSavedViewKey } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import { BookmarkIcon, ListFilterIcon, PlusIcon, SearchXIcon } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import { myWorkSaveAsQuery } from '@/features/MyWork/myWorkSaveAs';
import NavHeader from '@/features/NavHeader';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { workAttentionService } from '@/services/workAttention';

import { savedViewTitle } from './savedViewTitle';

const styles = createStaticStyles(({ css }) => ({
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
  `,
}));

const viewIcon = (view: SavedViewItem) =>
  builtinSavedViewKey(view.id) || view.entityType === 'project' ? ListFilterIcon : BookmarkIcon;

const ViewRow = memo<{ view: SavedViewItem }>(({ view }) => {
  const { t } = useTranslation('common');
  const builtin = Boolean(builtinSavedViewKey(view.id));

  return (
    <Flexbox horizontal align={'center'} className={styles.row}>
      <WorkspaceLink className={styles.link} to={`/views/${view.id}`}>
        <Icon color={cssVar.colorTextSecondary} icon={viewIcon(view)} size={16} />
        <Flexbox flex={1} style={{ minWidth: 0 }}>
          <Text ellipsis weight={500}>
            {savedViewTitle(view.id, view.name, t)}
          </Text>
        </Flexbox>
        {!builtin && view.visibility === 'team' ? (
          <Tag>{t('savedViews.visibilityTeam')}</Tag>
        ) : null}
        {!builtin && view.visibility === 'workspace' ? (
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
    </Flexbox>
  );
});

ViewRow.displayName = 'ViewRow';

const SavedViewsPage = memo(() => {
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const navigate = useWorkspaceAwareNavigate();
  const [keyword, setKeyword] = useState('');
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

  const createAssigned = useCallback(async () => {
    const created = await workAttentionService.savedViewCreate({
      entityType: 'task',
      name: t('savedViews.assignedDefaultName'),
      query: myWorkSaveAsQuery('assigned'),
      visibility: 'private',
    });
    await mutate(workAttentionKeys.savedViews(workspaceId));
    navigate(`/views/${created.data.id}`);
  }, [navigate, t, workspaceId]);

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
          <Button icon={PlusIcon} onClick={() => void createAssigned()}>
            {t('savedViews.saveAssigned')}
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
              icon={keyword.trim() ? SearchXIcon : BookmarkIcon}
            />
          </Center>
        ) : (
          <Flexbox gap={2}>
            {filteredViews.map((view) => (
              <ViewRow key={view.id} view={view} />
            ))}
          </Flexbox>
        )}
      </WideScreenContainer>
    </Flexbox>
  );
});

SavedViewsPage.displayName = 'SavedViewsPage';

export default SavedViewsPage;
