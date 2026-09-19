'use client';

import { Flexbox } from '@lobehub/ui';
import {
  Button,
  Segmented,
  TabsIndicator,
  TabsList,
  TabsRoot,
  TabsTab,
  Text,
  toast,
} from '@lobehub/ui/base-ui';
import { applyNoProjectFilter, type MyWorkMode, type WorkQueryLayout } from '@orvilo/types';
import { BookmarkPlusIcon, FolderXIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { workAttentionService } from '@/services/workAttention';

import { isMyWorkSaveableMode, myWorkSaveAsQuery } from './myWorkSaveAs';
import { isTaskFollowed } from './myWorkSubscribe';
import { isMyWorkBoardMode } from './workQueryBoard';
import { mergeWorkQueryGroups } from './workQueryPaging';
import WorkQueryResults from './WorkQueryResults';

const PRIMARY_TABS: MyWorkMode[] = ['assigned', 'delegated', 'review'];
const SECONDARY_TABS: MyWorkMode[] = ['created', 'subscribed'];

const resolveMode = (value: string | null): MyWorkMode => {
  if (value && [...PRIMARY_TABS, ...SECONDARY_TABS].includes(value as MyWorkMode)) {
    return value as MyWorkMode;
  }
  return 'assigned';
};

const resolveLayout = (mode: MyWorkMode, value: string | null): WorkQueryLayout => {
  if (!isMyWorkBoardMode(mode)) return 'list';
  return value === 'board' ? 'board' : 'list';
};

const MyWorkPage = memo(() => {
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const navigate = useWorkspaceAwareNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = resolveMode(searchParams.get('tab'));
  const layout = resolveLayout(mode, searchParams.get('layout'));
  const noProject = searchParams.get('noProject') === '1';
  const canBoard = isMyWorkBoardMode(mode);
  const boardActive = canBoard && layout === 'board';

  // One feed powers both layouts: list rows and the board's external groups
  // come from the same work query, so the two never disagree.
  const { data, error, isLoading } = useClientDataSWR(
    workAttentionKeys.myWork(workspaceId, mode, layout, noProject),
    () => workAttentionService.myWork({ layout, mode, noProject }),
  );
  const firstTasks = data?.data.tasks ?? [];
  const firstGroups = data?.data.groups ?? [];
  const queryHash = data?.data.queryHash;
  const [groupTail, setGroupTail] = useState<typeof firstGroups>([]);
  const [extraSubscribed, setExtraSubscribed] = useState<string[]>([]);
  useEffect(() => {
    setGroupTail([]);
    setExtraSubscribed([]);
  }, [layout, mode, noProject, queryHash, workspaceId]);
  const tasks = firstTasks;
  const groups = mergeWorkQueryGroups(firstGroups, groupTail);
  const subscribedTaskIds = [...(data?.data.subscribedTaskIds ?? []), ...extraSubscribed];
  const canSaveAs = isMyWorkSaveableMode(mode);

  const refresh = useCallback(async () => {
    setGroupTail([]);
    await mutate(workAttentionKeys.myWork(workspaceId, mode, layout, noProject));
  }, [layout, mode, noProject, workspaceId]);

  const loadMoreGroup = useCallback(
    async (groupKey: string) => {
      const column = groups.find((group) => group.key === groupKey);
      const last = column?.tasks.at(-1);
      if (!last || !queryHash) return;
      const next = await workAttentionService.myWork({
        afterId: last.id,
        groupKey,
        layout,
        mode,
        noProject,
        queryHash,
      });
      setGroupTail((current) => mergeWorkQueryGroups(current, next.data.groups ?? []));
      setExtraSubscribed((current) => [...current, ...(next.data.subscribedTaskIds ?? [])]);
    },
    [groups, layout, mode, noProject, queryHash],
  );

  const tabs = useMemo(
    () =>
      [...PRIMARY_TABS, ...SECONDARY_TABS].map((item) => ({
        key: item,
        label: t(`myWork.${item}`),
      })),
    [t],
  );

  const toggleFollow = useCallback(
    async (taskId: string, followed: boolean) => {
      try {
        if (followed) {
          await workAttentionService.unsubscribe(taskId);
        } else {
          await workAttentionService.subscribe(taskId);
        }
        await refresh();
      } catch {
        toast.error(t(followed ? 'myWork.unsubscribeFailed' : 'myWork.subscribeFailed'));
      }
    },
    [refresh, t],
  );

  const saveCopy = useCallback(async () => {
    if (!isMyWorkSaveableMode(mode)) return;
    try {
      const created = await workAttentionService.savedViewCreate({
        entityType: 'task',
        layout: canBoard ? layout : 'list',
        name: t(`myWork.${mode}`),
        query: applyNoProjectFilter(myWorkSaveAsQuery(mode, canBoard ? layout : 'list'), noProject),
        visibility: 'private',
      });
      await mutate(workAttentionKeys.savedViews(workspaceId));
      navigate(`/views/${created.data.id}`);
    } catch {
      toast.error(t('myWork.saveAsFailed'));
    }
  }, [canBoard, layout, mode, navigate, noProject, t, workspaceId]);

  const writeParams = (patch: { layout?: WorkQueryLayout; noProject?: boolean; tab?: string }) => {
    const nextTab = patch.tab ?? mode;
    const nextLayout = patch.layout ?? layout;
    const nextNoProject = patch.noProject ?? noProject;
    setSearchParams(
      {
        tab: nextTab,
        ...(isMyWorkBoardMode(nextTab as MyWorkMode) && nextLayout === 'board'
          ? { layout: 'board' }
          : {}),
        ...(nextNoProject ? { noProject: '1' } : {}),
      },
      { replace: true },
    );
  };

  return (
    <Flexbox flex={1} height="100%">
      <NavHeader
        left={
          <Text style={{ paddingInlineStart: 4 }} weight={500}>
            {t('tab.myWork')}
          </Text>
        }
      />
      {/* Board mode breaks out of the centered container — a kanban needs
          full-width horizontal scroll, not a letterboxed column. */}
      <WideScreenContainer
        gap={12}
        paddingBlock={16}
        wrapperStyle={boardActive ? undefined : { flex: 1, overflowY: 'auto' }}
      >
        <TabsRoot value={mode} onValueChange={(value) => writeParams({ tab: value })}>
          <TabsList>
            <TabsIndicator />
            {tabs.map((item) => (
              <TabsTab key={item.key} value={item.key}>
                {item.label}
              </TabsTab>
            ))}
          </TabsList>
        </TabsRoot>
        <Flexbox horizontal align={'center'} gap={12} justify={'space-between'}>
          <Button
            icon={FolderXIcon}
            size={'small'}
            type={noProject ? 'primary' : 'default'}
            onClick={() => writeParams({ noProject: !noProject })}
          >
            {t('myWork.noProject')}
          </Button>
          <Flexbox horizontal align={'center'} gap={8}>
            {canBoard ? (
              <Segmented
                size={'small'}
                value={layout}
                options={[
                  { label: t('myWork.layoutList'), value: 'list' },
                  { label: t('myWork.layoutBoard'), value: 'board' },
                ]}
                onChange={(value) => writeParams({ layout: value as WorkQueryLayout })}
              />
            ) : null}
            {canSaveAs ? (
              <Button icon={BookmarkPlusIcon} size={'small'} onClick={() => void saveCopy()}>
                {t('myWork.saveAs')}
              </Button>
            ) : null}
          </Flexbox>
        </Flexbox>
        {/* A failed fetch must never render as a confident empty list —
            loaded data stays visible with an inline failure marker. */}
        {error && tasks.length === 0 ? (
          <AsyncError error={error} variant={'block'} onRetry={() => void refresh()} />
        ) : (
          <>
            {error ? (
              <AsyncError error={error} variant={'inline'} onRetry={() => void refresh()} />
            ) : null}
            <WorkQueryResults
              emptyLabel={t('myWork.empty')}
              externalReviews={mode === 'review' ? (data?.data.externalReviews ?? []) : undefined}
              groupBy={data?.data.groupBy}
              groups={groups}
              isFollowed={(taskId) => isTaskFollowed(taskId, mode, subscribedTaskIds)}
              layout={layout}
              loadMoreLabel={t('myWork.loadMore')}
              loading={isLoading}
              loadingLabel={t('myWork.loading')}
              tasks={tasks}
              total={data?.data.total}
              onLoadMoreGroup={(key) => void loadMoreGroup(key)}
              onMoved={() => void refresh()}
              onToggleFollow={(taskId, followed) => void toggleFollow(taskId, followed)}
            />
          </>
        )}
      </WideScreenContainer>
    </Flexbox>
  );
});

MyWorkPage.displayName = 'MyWorkPage';

export default MyWorkPage;
