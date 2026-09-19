'use client';

import { Center, Empty, Flexbox, Icon, Input, Tooltip } from '@lobehub/ui';
import { Alert, Button, Select, Text, TextArea, toast } from '@lobehub/ui/base-ui';
import type { SavedViewVisibility, WorkQueryLayout } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import { FolderClosedIcon, SlidersHorizontalIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { PROJECT_STATUS_VISUALS, resolveProjectStatus } from '@/components/ExecutionStatus';
import WorkFavoriteButton from '@/features/HomeSidebar/Body/WorkFavoriteButton';
import {
  mergeWorkQueryGroups,
  mergeWorkQueryPage,
  workQueryHasMore,
} from '@/features/MyWork/workQueryPaging';
import WorkQueryResults from '@/features/MyWork/WorkQueryResults';
import NavHeader from '@/features/NavHeader';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { lambdaClient } from '@/libs/trpc/client';
import { workAttentionService } from '@/services/workAttention';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';
import { isTrpcErrorCode } from '@/utils/trpcError';

import { savedViewProjectPath } from './savedViewProjectPath';
import { stringifyWorkQueryDraft, workQueryFromDraft } from './savedViewQueryDraft';
import { isSavedViewShareReady, savedViewCopyName, savedViewSharePatch } from './savedViewShare';
import { savedViewTitle } from './savedViewTitle';

const styles = createStaticStyles(({ css }) => ({
  identifier: css`
    flex: none;
    min-width: 72px;
    color: ${cssVar.colorTextTertiary};
  `,
  link: css`
    display: flex;
    flex: 1;
    gap: 8px;
    align-items: center;

    min-width: 0;

    color: inherit;
  `,
  row: css`
    padding-block: 7px;
    padding-inline: 4px 12px;
    border-radius: ${cssVar.borderRadiusLG};
    color: inherit;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  updatedAt: css`
    flex: none;

    min-width: 88px;

    color: ${cssVar.colorTextQuaternary};
    text-align: end;
    white-space: nowrap;
  `,
}));

interface SavedViewProjectRowData {
  id: string;
  identifier?: string | null;
  name: string;
  slug?: string | null;
  status?: string | null;
  updatedAt?: Date | string | null;
}

export const SavedViewProjectRow = memo<{ project: SavedViewProjectRowData }>(({ project }) => {
  const { t } = useTranslation('project');
  const status = resolveProjectStatus(project.status);
  const statusVisual = PROJECT_STATUS_VISUALS[status];

  return (
    <Flexbox horizontal align="center" className={styles.row}>
      <WorkspaceLink className={styles.link} to={savedViewProjectPath(project)}>
        <Tooltip title={t(`acceptance.status.${status}`)}>
          <Icon color={statusVisual.color} icon={statusVisual.icon} size={16} />
        </Tooltip>
        <Flexbox flex={1} style={{ minWidth: 0 }}>
          <Text ellipsis weight={500}>
            {project.name}
          </Text>
        </Flexbox>
        {project.identifier ? (
          <Text className={styles.identifier} fontSize={12}>
            {project.identifier}
          </Text>
        ) : null}
        {project.updatedAt ? (
          <Text
            className={styles.updatedAt}
            fontSize={12}
            title={dayjs(project.updatedAt).format('YYYY-MM-DD HH:mm')}
          >
            {dayjs(project.updatedAt).fromNow()}
          </Text>
        ) : null}
      </WorkspaceLink>
    </Flexbox>
  );
});

SavedViewProjectRow.displayName = 'SavedViewProjectRow';

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
  /* The query/name/share form is authoring chrome — hidden until asked for,
     so the page reads as the view itself, not an editor. */
  const [editing, setEditing] = useState(false);
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
              <Button
                icon={SlidersHorizontalIcon}
                size="small"
                type={editing ? 'primary' : 'default'}
                onClick={() => setEditing((current) => !current)}
              >
                {t('savedViews.editView')}
              </Button>
            ) : null}
            {isOwner ? (
              <Button size="small" onClick={() => void deleteView()}>
                {t('savedViews.delete')}
              </Button>
            ) : null}
          </Flexbox>
        }
      />
      <Flexbox gap={12} padding={16} style={{ overflow: 'auto' }}>
        {isOwner && editing ? (
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
              <SkeletonList aria-label={t('savedViews.loading')} rows={8} />
            ) : projectRows.length === 0 ? (
              <Center flex={1} padding={48}>
                <Empty description={t('savedViews.emptyResults')} icon={FolderClosedIcon} />
              </Center>
            ) : (
              <Flexbox gap={2}>
                {projectRows.map((project) => (
                  <SavedViewProjectRow key={project.id} project={project} />
                ))}
              </Flexbox>
            )}
            {workQueryHasMore(projectRows.length, evaluation?.total) ? (
              <Flexbox horizontal justify="center">
                <Button size="small" onClick={() => void loadMore()}>
                  {t('savedViews.loadMore')}
                </Button>
              </Flexbox>
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
            onLoadMoreGroup={(key) => void loadMoreGroup(key)}
            onMoved={() => void refreshView()}
            onLoadMore={
              (evaluation?.layout ?? viewLayout) === 'list' ? () => void loadMore() : undefined
            }
          />
        )}
      </Flexbox>
    </Flexbox>
  );
});

SavedViewPage.displayName = 'SavedViewPage';

export default SavedViewPage;
