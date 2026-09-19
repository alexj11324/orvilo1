'use client';

import { Empty, Flexbox, Input } from '@lobehub/ui';
import { Alert, Button, Select, Text, TextArea, toast } from '@lobehub/ui/base-ui';
import type { SavedViewVisibility, WorkQueryLayout } from '@orvilo/types';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import WorkFavoriteButton from '@/features/HomeSidebar/Body/WorkFavoriteButton';
import {
  mergeWorkQueryGroups,
  mergeWorkQueryPage,
  workQueryHasMore,
} from '@/features/MyWork/workQueryPaging';
import WorkQueryResults from '@/features/MyWork/WorkQueryResults';
import NavHeader from '@/features/NavHeader';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { lambdaClient } from '@/libs/trpc/client';
import { workAttentionService } from '@/services/workAttention';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';
import { isTrpcErrorCode } from '@/utils/trpcError';

import { stringifyWorkQueryDraft, workQueryFromDraft } from './savedViewQueryDraft';
import { isSavedViewShareReady, savedViewCopyName, savedViewSharePatch } from './savedViewShare';
import { savedViewTitle } from './savedViewTitle';

const SavedViewPage = memo(() => {
  const { t } = useTranslation('common');
  const { viewId } = useParams<{ viewId: string }>();
  const workspaceId = useActiveWorkspaceId();
  const navigate = useWorkspaceAwareNavigate();
  const currentUserId = useUserStore(userProfileSelectors.userId);
  const { data, isLoading } = useClientDataSWR(
    viewId ? workAttentionKeys.savedView(workspaceId, viewId) : null,
    () => workAttentionService.savedViewEvaluate({ id: viewId! }),
  );
  const { data: teamsData } = useClientDataSWR(
    workspaceId ? workAttentionKeys.teams(workspaceId) : null,
    () => lambdaClient.team.teams.query(),
  );
  const view = data?.data.view;
  const evaluation = data?.data.evaluation;
  const firstTasks = evaluation?.tasks ?? [];
  const firstProjects = evaluation?.projects ?? [];
  const firstGroups = evaluation?.groups ?? [];
  const queryHash = evaluation?.queryHash;
  const [tail, setTail] = useState<typeof firstTasks>([]);
  const [projectTail, setProjectTail] = useState<typeof firstProjects>([]);
  const [groupTail, setGroupTail] = useState<typeof firstGroups>([]);
  useEffect(() => {
    setTail([]);
    setProjectTail([]);
    setGroupTail([]);
  }, [queryHash, viewId, workspaceId]);
  const tasks = mergeWorkQueryPage(firstTasks, tail);
  const projectRows = mergeWorkQueryPage(firstProjects, projectTail);
  const groups = mergeWorkQueryGroups(firstGroups, groupTail);
  const isOwner = Boolean(currentUserId && view && view.ownerUserId === currentUserId);
  const [name, setName] = useState('');
  const [queryDraft, setQueryDraft] = useState('');
  const [visibility, setVisibility] = useState<SavedViewVisibility>('private');
  const [layout, setLayout] = useState<WorkQueryLayout>('list');
  const [teamId, setTeamId] = useState<string | null>(null);
  const viewName = view?.name;
  const viewQueryAst = view?.queryAst;
  const viewVisibility = view?.visibility;
  const viewLayout = view?.layout;
  const viewTeamId = view?.teamId;
  const viewIdValue = view?.id;
  const definitionVersion = view?.definitionVersion;

  useEffect(() => {
    if (!viewIdValue) return;
    setName(viewName ?? '');
    setQueryDraft(viewQueryAst ? stringifyWorkQueryDraft(viewQueryAst) : '');
    setVisibility(viewVisibility ?? 'private');
    setLayout(viewLayout ?? 'list');
    setTeamId(viewTeamId ?? null);
  }, [
    definitionVersion,
    viewIdValue,
    viewLayout,
    viewName,
    viewQueryAst,
    viewTeamId,
    viewVisibility,
  ]);

  const teamOptions = useMemo(
    () => (teamsData?.data ?? []).map((team) => ({ label: team.name, value: team.id })),
    [teamsData?.data],
  );
  const visibilityOptions = useMemo(
    () => [
      { label: t('savedViews.visibilityPrivate'), value: 'private' },
      ...(workspaceId
        ? [
            { label: t('savedViews.visibilityWorkspace'), value: 'workspace' },
            { label: t('savedViews.visibilityTeam'), value: 'team' },
          ]
        : []),
    ],
    [t, workspaceId],
  );
  const layoutOptions = useMemo(
    () => [
      { label: t('savedViews.layoutList'), value: 'list' },
      { label: t('savedViews.layoutBoard'), value: 'board' },
    ],
    [t],
  );
  const shareReady = isSavedViewShareReady(visibility, teamId);

  const refreshView = useCallback(async () => {
    if (!viewId) return;
    await mutate(workAttentionKeys.savedView(workspaceId, viewId));
    await mutate(workAttentionKeys.savedViews(workspaceId));
    await mutate(workAttentionKeys.favorites(workspaceId));
  }, [viewId, workspaceId]);

  const loadMore = useCallback(async () => {
    if (!queryHash || !viewId) return;
    if (view?.entityType === 'project') {
      const last = projectRows.at(-1);
      if (!last) return;
      const next = await workAttentionService.savedViewEvaluate({
        afterId: last.id,
        id: viewId,
        queryHash,
      });
      setProjectTail((current) => mergeWorkQueryPage(current, next.data.evaluation.projects ?? []));
      return;
    }
    const last = tasks.at(-1);
    if (!last) return;
    const next = await workAttentionService.savedViewEvaluate({
      afterId: last.id,
      id: viewId,
      queryHash,
    });
    setTail((current) => mergeWorkQueryPage(current, next.data.evaluation.tasks ?? []));
  }, [projectRows, queryHash, tasks, view?.entityType, viewId]);

  const loadMoreGroup = useCallback(
    async (groupKey: string) => {
      const column = groups.find((group) => group.key === groupKey);
      const last = column?.tasks.at(-1);
      if (!last || !queryHash || !viewId) return;
      const next = await workAttentionService.savedViewEvaluate({
        afterId: last.id,
        groupKey,
        id: viewId,
        queryHash,
      });
      setGroupTail((current) => mergeWorkQueryGroups(current, next.data.evaluation.groups ?? []));
    },
    [groups, queryHash, viewId],
  );

  const saveView = useCallback(async () => {
    if (!viewId || !view || !shareReady) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const query = workQueryFromDraft(queryDraft, view.entityType);
    if (!query) {
      toast.error(t('savedViews.queryInvalid'));
      return;
    }
    try {
      await workAttentionService.savedViewUpdate({
        expectedDefinitionVersion: view.definitionVersion,
        id: viewId,
        layout,
        name: trimmed,
        query,
        ...savedViewSharePatch(visibility, teamId),
      });
      await refreshView();
      toast.success(t('savedViews.saved'));
    } catch (error) {
      toast.error(
        isTrpcErrorCode(error, 'CONFLICT')
          ? t('savedViews.versionConflict')
          : t('savedViews.saveFailed'),
      );
      await refreshView();
    }
  }, [layout, name, queryDraft, refreshView, shareReady, t, teamId, view, viewId, visibility]);

  const saveCopy = useCallback(async () => {
    if (!view) return;
    const query = workQueryFromDraft(queryDraft, view.entityType) ?? view.queryAst;
    if (!query) {
      toast.error(t('savedViews.queryInvalid'));
      return;
    }
    try {
      const created = await workAttentionService.savedViewCreate({
        entityType: view.entityType,
        layout,
        name: savedViewCopyName(savedViewTitle(view.id, name || view.name, t), t('copy')),
        query,
        visibility: 'private',
      });
      await mutate(workAttentionKeys.savedViews(workspaceId));
      navigate(`/views/${created.data.id}`);
    } catch {
      toast.error(t('savedViews.saveAsFailed'));
    }
  }, [layout, name, navigate, queryDraft, t, view, workspaceId]);

  const deleteView = useCallback(async () => {
    if (!viewId) return;
    try {
      await workAttentionService.savedViewDelete(viewId);
      await mutate(workAttentionKeys.savedViews(workspaceId));
      await mutate(workAttentionKeys.favorites(workspaceId));
      navigate('/views');
    } catch {
      toast.error(t('savedViews.deleteFailed'));
    }
  }, [navigate, t, viewId, workspaceId]);

  return (
    <Flexbox flex={1} height="100%">
      <NavHeader
        left={
          <Text style={{ paddingInlineStart: 4 }} weight={500}>
            {view ? savedViewTitle(view.id, view.name, t) : t('tab.views')}
          </Text>
        }
        right={
          <Flexbox horizontal gap={8}>
            {isOwner ? (
              <Button
                disabled={!shareReady}
                size="small"
                type="primary"
                onClick={() => void saveView()}
              >
                {t('save')}
              </Button>
            ) : null}
            <Button size="small" onClick={() => void saveCopy()}>
              {t('savedViews.saveAs')}
            </Button>
            <WorkFavoriteButton targetId={viewId} targetType="savedView" />
            {isOwner ? (
              <Button size="small" onClick={() => void deleteView()}>
                {t('savedViews.delete')}
              </Button>
            ) : null}
          </Flexbox>
        }
      />
      <Flexbox gap={12} padding={16} style={{ overflow: 'auto' }}>
        {isOwner ? (
          <Flexbox gap={8}>
            <Input
              placeholder={t('savedViews.name')}
              size="small"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <TextArea
              aria-label={t('savedViews.query')}
              autoSize={{ minRows: 6, maxRows: 16 }}
              placeholder={t('savedViews.query')}
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
            />
            <Flexbox horizontal gap={8} wrap="wrap">
              <Select
                options={layoutOptions}
                size="small"
                style={{ minWidth: 160 }}
                value={layout}
                onChange={(next) => {
                  if (next === 'board' || next === 'list') setLayout(next);
                }}
              />
              <Select
                options={visibilityOptions}
                size="small"
                style={{ minWidth: 160 }}
                value={visibility}
                onChange={(next) => {
                  if (next === 'private' || next === 'team' || next === 'workspace') {
                    setVisibility(next);
                    if (next !== 'team') setTeamId(null);
                  }
                }}
              />
              {visibility === 'team' ? (
                <Select
                  options={teamOptions}
                  placeholder={t('savedViews.teamRequired')}
                  size="small"
                  style={{ minWidth: 160 }}
                  value={teamId ?? undefined}
                  onChange={(next) => {
                    if (typeof next === 'string') setTeamId(next);
                  }}
                />
              ) : null}
            </Flexbox>
          </Flexbox>
        ) : null}
        {evaluation?.needsRepair ? (
          <Alert
            showIcon
            description={t('savedViews.needsRepairDesc')}
            title={t('savedViews.needsRepair')}
            type="warning"
          />
        ) : null}
        {evaluation?.needsRepair ? (
          isLoading ? (
            <Text type="secondary">{t('savedViews.loading')}</Text>
          ) : (
            <Empty description={t('savedViews.needsRepairEmpty')} />
          )
        ) : view?.entityType === 'project' ? (
          <Flexbox gap={16}>
            {isLoading ? (
              <Text type="secondary">{t('savedViews.loading')}</Text>
            ) : projectRows.length === 0 ? (
              <Empty description={t('savedViews.emptyResults')} />
            ) : (
              projectRows.map((project) => (
                <WorkspaceLink key={project.id} to={`/project/${project.id}`}>
                  <Text weight={500}>{project.name}</Text>
                </WorkspaceLink>
              ))
            )}
            {workQueryHasMore(projectRows.length, evaluation?.total) ? (
              <Button size="small" onClick={() => void loadMore()}>
                {t('savedViews.loadMore')}
              </Button>
            ) : null}
          </Flexbox>
        ) : (
          <WorkQueryResults
            emptyLabel={t('savedViews.emptyResults')}
            groupBy={evaluation?.groupBy}
            groups={groups}
            layout={evaluation?.layout ?? viewLayout ?? 'list'}
            loadMoreLabel={t('savedViews.loadMore')}
            loading={isLoading}
            loadingLabel={t('savedViews.loading')}
            movable={(evaluation?.layout ?? viewLayout) === 'board'}
            tasks={tasks}
            total={evaluation?.total}
            onMoved={() => void refreshView()}
            onLoadMore={
              (evaluation?.layout ?? viewLayout) === 'list' ? () => void loadMore() : undefined
            }
            onLoadMoreGroup={
              (evaluation?.layout ?? viewLayout) === 'board'
                ? (key) => void loadMoreGroup(key)
                : undefined
            }
          />
        )}
      </Flexbox>
    </Flexbox>
  );
});

SavedViewPage.displayName = 'SavedViewPage';

export default SavedViewPage;
