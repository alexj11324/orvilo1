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
import { getMyTaskViewOptions } from '@/features/AgentTasks/AgentTaskList/AgentTasksPage';
import KanbanBoard from '@/features/AgentTasks/AgentTaskList/KanbanBoard';
import { DEFAULT_TASK_LIST_VIEW_OPTIONS } from '@/features/AgentTasks/AgentTaskList/listViewOptions';
import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { workAttentionService } from '@/services/workAttention';

import { isMyWorkSaveableMode, myWorkSaveAsQuery } from './myWorkSaveAs';
import { isTaskFollowed } from './myWorkSubscribe';
import { isMyWorkBoardMode } from './workQueryBoard';
import { mergeWorkQueryPage } from './workQueryPaging';
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

  // The board surface is the shared KanbanBoard, which fetches through the
  // task store — the work-query feed only powers list layout (and Review).
  const { data, isLoading } = useClientDataSWR(
    boardActive ? null : workAttentionKeys.myWork(workspaceId, mode, layout, noProject),
    () => workAttentionService.myWork({ layout: 'list', mode, noProject }),
  );
  const firstTasks = data?.data.tasks ?? [];
  const queryHash = data?.data.queryHash;
  const [tail, setTail] = useState<typeof firstTasks>([]);
  const [extraSubscribed, setExtraSubscribed] = useState<string[]>([]);
  useEffect(() => {
    setTail([]);
    setExtraSubscribed([]);
  }, [layout, mode, noProject, queryHash, workspaceId]);
  const tasks = mergeWorkQueryPage(firstTasks, tail);
  const boardViewOptions = useMemo(() => getMyTaskViewOptions(DEFAULT_TASK_LIST_VIEW_OPTIONS), []);
  const subscribedTaskIds = [...(data?.data.subscribedTaskIds ?? []), ...extraSubscribed];
  const canSaveAs = isMyWorkSaveableMode(mode);

  const refresh = useCallback(async () => {
    await mutate(workAttentionKeys.myWork(workspaceId, mode, layout, noProject));
  }, [layout, mode, noProject, workspaceId]);

  const loadMore = useCallback(async () => {
    const last = tasks.at(-1);
    if (!last || !queryHash) return;
    const next = await workAttentionService.myWork({
      afterId: last.id,
      layout: canBoard ? layout : 'list',
      mode,
      noProject,
      queryHash,
    });
    setTail((current) => mergeWorkQueryPage(current, next.data.tasks));
    setExtraSubscribed((current) => [...current, ...(next.data.subscribedTaskIds ?? [])]);
  }, [canBoard, layout, mode, noProject, queryHash, tasks]);

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
      <WideScreenContainer gap={12} paddingBlock={16} wrapperStyle={{ flex: 1, overflowY: 'auto' }}>
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
        {boardActive ? (
          /* The same Cordy-ported board /tasks mounts — myTaskScope narrows
             the grouped query to the caller's slice ('delegated' = tasks the
             caller handed to agents). */
          <Flexbox flex={1} style={{ minHeight: 0, overflowX: 'auto', overflowY: 'hidden' }}>
            <KanbanBoard
              emptyDescription={t('myWork.empty')}
              myTaskScope={mode === 'delegated' ? 'delegated' : 'assigned'}
              options={boardViewOptions}
              projectId={noProject ? null : undefined}
              routeScope={'global'}
            />
          </Flexbox>
        ) : (
          <WorkQueryResults
            emptyLabel={t('myWork.empty')}
            externalReviews={mode === 'review' ? (data?.data.externalReviews ?? []) : undefined}
            isFollowed={(taskId) => isTaskFollowed(taskId, mode, subscribedTaskIds)}
            loadMoreLabel={t('myWork.loadMore')}
            loading={isLoading}
            loadingLabel={t('myWork.loading')}
            tasks={tasks}
            total={data?.data.total}
            onLoadMore={layout === 'list' ? () => void loadMore() : undefined}
            onToggleFollow={(taskId, followed) => void toggleFollow(taskId, followed)}
          />
        )}
      </WideScreenContainer>
    </Flexbox>
  );
});

MyWorkPage.displayName = 'MyWorkPage';

export default MyWorkPage;
