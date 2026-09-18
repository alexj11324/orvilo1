'use client';

import { Flexbox } from '@lobehub/ui';
import {
  Button,
  TabsIndicator,
  TabsList,
  TabsRoot,
  TabsTab,
  Text,
  toast,
} from '@lobehub/ui/base-ui';
import type { MyWorkMode, WorkQueryLayout } from '@orvilo/types';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import NavHeader from '@/features/NavHeader';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { workAttentionService } from '@/services/workAttention';

import { isMyWorkSaveableMode, myWorkSaveAsQuery } from './myWorkSaveAs';
import { isTaskFollowed } from './myWorkSubscribe';
import { isMyWorkBoardMode } from './workQueryBoard';
import { mergeWorkQueryGroups, mergeWorkQueryPage } from './workQueryPaging';
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
  const canBoard = isMyWorkBoardMode(mode);

  const { data, isLoading } = useClientDataSWR(
    workAttentionKeys.myWork(workspaceId, mode, layout),
    () => workAttentionService.myWork({ layout: canBoard ? layout : 'list', mode }),
  );
  const firstTasks = data?.data.tasks ?? [];
  const firstGroups = data?.data.groups ?? [];
  const queryHash = data?.data.queryHash;
  const [tail, setTail] = useState<typeof firstTasks>([]);
  const [groupTail, setGroupTail] = useState<typeof firstGroups>([]);
  const [extraSubscribed, setExtraSubscribed] = useState<string[]>([]);
  useEffect(() => {
    setTail([]);
    setGroupTail([]);
    setExtraSubscribed([]);
  }, [layout, mode, queryHash, workspaceId]);
  const tasks = mergeWorkQueryPage(firstTasks, tail);
  const groups = mergeWorkQueryGroups(firstGroups, groupTail);
  const subscribedTaskIds = [...(data?.data.subscribedTaskIds ?? []), ...extraSubscribed];
  const canSaveAs = isMyWorkSaveableMode(mode);

  const refresh = useCallback(async () => {
    await mutate(workAttentionKeys.myWork(workspaceId, mode, layout));
  }, [layout, mode, workspaceId]);

  const loadMore = useCallback(async () => {
    const last = tasks.at(-1);
    if (!last || !queryHash) return;
    const next = await workAttentionService.myWork({
      afterId: last.id,
      layout: canBoard ? layout : 'list',
      mode,
      queryHash,
    });
    setTail((current) => mergeWorkQueryPage(current, next.data.tasks));
    setExtraSubscribed((current) => [...current, ...(next.data.subscribedTaskIds ?? [])]);
  }, [canBoard, layout, mode, queryHash, tasks]);

  const loadMoreGroup = useCallback(
    async (groupKey: string) => {
      const column = groups.find((group) => group.key === groupKey);
      const last = column?.tasks.at(-1);
      if (!last || !queryHash) return;
      const next = await workAttentionService.myWork({
        afterId: last.id,
        groupKey,
        layout: 'board',
        mode,
        queryHash,
      });
      setGroupTail((current) => mergeWorkQueryGroups(current, next.data.groups ?? []));
      setExtraSubscribed((current) => [...current, ...(next.data.subscribedTaskIds ?? [])]);
    },
    [groups, mode, queryHash],
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
        query: myWorkSaveAsQuery(mode, canBoard ? layout : 'list'),
        visibility: 'private',
      });
      await mutate(workAttentionKeys.savedViews(workspaceId));
      navigate(`/views/${created.data.id}`);
    } catch {
      toast.error(t('myWork.saveAsFailed'));
    }
  }, [canBoard, layout, mode, navigate, t, workspaceId]);

  return (
    <Flexbox flex={1} height="100%">
      <NavHeader
        left={
          <Text style={{ paddingInlineStart: 4 }} weight={500}>
            {t('tab.myWork')}
          </Text>
        }
        right={
          <Flexbox horizontal gap={8}>
            {canBoard ? (
              <Button
                size="small"
                onClick={() =>
                  setSearchParams(
                    { layout: layout === 'board' ? 'list' : 'board', tab: mode },
                    { replace: true },
                  )
                }
              >
                {layout === 'board' ? t('myWork.layoutList') : t('myWork.layoutBoard')}
              </Button>
            ) : null}
            {canSaveAs ? (
              <Button size="small" onClick={() => void saveCopy()}>
                {t('myWork.saveAs')}
              </Button>
            ) : null}
          </Flexbox>
        }
      />
      <Flexbox gap={16} padding={16} style={{ overflow: 'auto' }}>
        <TabsRoot
          value={mode}
          onValueChange={(value) =>
            setSearchParams(
              { tab: value, ...(canBoard && layout === 'board' ? { layout: 'board' } : {}) },
              { replace: true },
            )
          }
        >
          <TabsList>
            <TabsIndicator />
            {tabs.map((item) => (
              <TabsTab key={item.key} value={item.key}>
                {item.label}
              </TabsTab>
            ))}
          </TabsList>
        </TabsRoot>
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
          movable={canBoard && layout === 'board'}
          tasks={tasks}
          total={data?.data.total}
          onLoadMore={layout === 'list' ? () => void loadMore() : undefined}
          onLoadMoreGroup={layout === 'board' ? (key) => void loadMoreGroup(key) : undefined}
          onMoved={() => void refresh()}
          onToggleFollow={(taskId, followed) => void toggleFollow(taskId, followed)}
        />
      </Flexbox>
    </Flexbox>
  );
});

MyWorkPage.displayName = 'MyWorkPage';

export default MyWorkPage;
