'use client';

import { Center, Empty, Flexbox, Icon, Tooltip } from '@lobehub/ui';
import { Alert, Button, confirmModal, DropdownMenu, Text, toast } from '@lobehub/ui/base-ui';
import type { SavedViewItem, WorkQuery } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import { EllipsisIcon, FolderClosedIcon, SlidersHorizontalIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import useSWR from 'swr';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import { PROJECT_STATUS_VISUALS, resolveProjectStatus } from '@/components/ExecutionStatus';
import WorkFavoriteButton from '@/features/HomeSidebar/Body/WorkFavoriteButton';
import {
  mergeWorkQueryGroups,
  mergeWorkQueryPage,
  type WorkQueryGroupPage,
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
import { isSavedViewShareReady, savedViewCopyName, savedViewSharePatch } from './savedViewShare';
import { savedViewTitle } from './savedViewTitle';
import ViewDefinitionEditor, { type ViewEditorState } from './ViewDefinitionEditor';
import { builderToFilter, comparableQuery, filterToBuilder } from './workQueryBuilder';

const styles = createStaticStyles(({ css }) => ({
  boardColumn: css`
    flex: none;

    width: 300px;
    padding-block-end: 12px;
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorFillQuaternary};
  `,
  boardColumnBody: css`
    gap: 4px;
    padding-inline: 8px;
  `,
  boardColumnHeader: css`
    display: flex;
    gap: 8px;
    align-items: center;

    padding-block: 10px;
    padding-inline: 12px;

    font-size: ${cssVar.fontSizeSM};
    color: ${cssVar.colorTextSecondary};
  `,
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

/** Read-only status board for project views — the kanban columns Linear
 *  renders for project status. Project cards are not draggable here:
 *  status changes flow through the project surface. */
const SavedViewProjectBoard = memo<{
  groups: WorkQueryGroupPage<SavedViewProjectRowData>[];
  loadMoreLabel: string;
  onLoadMoreGroup?: (key: string) => void;
}>(({ groups, loadMoreLabel, onLoadMoreGroup }) => {
  const { t } = useTranslation('project');
  return (
    <Flexbox horizontal align="flex-start" gap={12} style={{ overflowX: 'auto' }}>
      {groups.map((group) => {
        const status = resolveProjectStatus(group.key);
        const visual = PROJECT_STATUS_VISUALS[status];
        return (
          <Flexbox className={styles.boardColumn} key={group.key}>
            <Flexbox horizontal className={styles.boardColumnHeader}>
              <Icon color={visual.color} icon={visual.icon} size={14} />
              <Text fontSize={13} weight={500}>
                {t(`acceptance.status.${status}`)}
              </Text>
              <Text fontSize={12} type="secondary">
                {group.total}
              </Text>
            </Flexbox>
            <Flexbox className={styles.boardColumnBody}>
              {group.tasks.map((project) => (
                <SavedViewProjectRow key={project.id} project={project} />
              ))}
              {group.hasMore && onLoadMoreGroup ? (
                <Button size="small" onClick={() => onLoadMoreGroup(group.key)}>
                  {loadMoreLabel}
                </Button>
              ) : null}
            </Flexbox>
          </Flexbox>
        );
      })}
    </Flexbox>
  );
});

SavedViewProjectBoard.displayName = 'SavedViewProjectBoard';

const viewToEditorState = (view: SavedViewItem): ViewEditorState => ({
  builder: filterToBuilder(view.entityType, view.queryAst.filter),
  entityType: view.entityType,
  groupBy: view.queryAst.groupBy ?? 'none',
  layout: view.layout ?? 'list',
  name: view.name,
  sort: view.queryAst.sort,
  teamId: view.teamId ?? null,
  visibility: view.visibility ?? 'private',
});

const draftQuery = (state: ViewEditorState): WorkQuery => ({
  entityType: state.entityType,
  filter: builderToFilter(state.entityType, state.builder),
  groupBy: state.groupBy === 'none' ? undefined : state.groupBy,
  schemaVersion: 1,
  sort: state.sort,
});

const SavedViewPage = memo(() => {
  const { t } = useTranslation('common');
  const { viewId } = useParams<{ viewId: string }>();
  const workspaceId = useActiveWorkspaceId();
  const navigate = useWorkspaceAwareNavigate();
  const currentUserId = useUserStore(userProfileSelectors.userId);
  const { data, error, isLoading } = useClientDataSWR(
    viewId ? workAttentionKeys.savedView(workspaceId, viewId) : null,
    () => workAttentionService.savedViewEvaluate({ id: viewId! }),
  );
  const view = data?.data.view;
  const evaluation = data?.data.evaluation;
  // A cross-team view can't guess which team a new card belongs to — pass the
  // caller's joined teams so the board's create entry asks exactly that.
  const { data: teamsData } = useSWR(
    workspaceId && currentUserId ? ['savedview-joined-teams', currentUserId, workspaceId] : null,
    () => lambdaClient.team.teams.query(),
    { revalidateOnFocus: false },
  );
  const joinedTeamOptions = useMemo(
    () =>
      (teamsData?.data ?? [])
        .filter((team) => team.joined === true)
        .map((team) => ({ id: team.id, name: team.name })),
    [teamsData],
  );
  const firstTasks = evaluation?.tasks ?? [];
  const firstProjects = evaluation?.projects ?? [];
  const firstGroups = evaluation?.groups ?? [];
  const firstProjectGroups = useMemo<WorkQueryGroupPage<SavedViewProjectRowData>[]>(
    () =>
      (evaluation?.projectGroups ?? []).map((group) => ({
        hasMore: group.hasMore,
        key: group.key,
        tasks: group.projects,
        total: group.total,
      })),
    [evaluation?.projectGroups],
  );
  const queryHash = evaluation?.queryHash;
  const [tail, setTail] = useState<typeof firstTasks>([]);
  const [projectTail, setProjectTail] = useState<typeof firstProjects>([]);
  const [groupTail, setGroupTail] = useState<typeof firstGroups>([]);
  const [projectGroupTail, setProjectGroupTail] = useState<
    WorkQueryGroupPage<SavedViewProjectRowData>[]
  >([]);
  useEffect(() => {
    setTail([]);
    setProjectTail([]);
    setGroupTail([]);
    setProjectGroupTail([]);
  }, [queryHash, viewId, workspaceId]);
  const tasks = mergeWorkQueryPage(firstTasks, tail);
  const projectRows = mergeWorkQueryPage(firstProjects, projectTail);
  const groups = mergeWorkQueryGroups(firstGroups, groupTail);
  const projectGroups = mergeWorkQueryGroups(firstProjectGroups, projectGroupTail);
  const isOwner = Boolean(currentUserId && view && view.ownerUserId === currentUserId);

  /* Draft editing state — `draftBase` is the definitionVersion the editor was
     built from; when the server-side version moves while the draft is dirty,
     the user picks reload/save-as-copy instead of being silently clobbered. */
  const [draft, setDraft] = useState<ViewEditorState | null>(null);
  const [draftBase, setDraftBase] = useState<number | undefined>();
  const [conflict, setConflict] = useState(false);
  const [editing, setEditing] = useState(false);

  const dirty = useMemo(() => {
    if (!draft || !view) return false;
    return (
      draft.name !== view.name ||
      draft.layout !== (view.layout ?? 'list') ||
      draft.visibility !== view.visibility ||
      draft.teamId !== (view.teamId ?? null) ||
      comparableQuery(draftQuery(draft)) !== comparableQuery(view.queryAst)
    );
  }, [draft, view]);

  const viewFingerprint = view
    ? `${view.id}:${view.definitionVersion}:${view.name}:${view.layout}:${view.visibility}:${view.teamId ?? ''}`
    : undefined;
  useEffect(() => {
    if (!view) return;
    if (!draft || !dirty) {
      setDraft(viewToEditorState(view));
      setDraftBase(view.definitionVersion);
      setConflict(false);
      return;
    }
    if (view.definitionVersion !== draftBase) setConflict(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewFingerprint]);

  const shareReady = draft ? isSavedViewShareReady(draft.visibility, draft.teamId) : false;

  const refreshView = useCallback(async () => {
    if (!viewId) return;
    setTail([]);
    setProjectTail([]);
    setGroupTail([]);
    setProjectGroupTail([]);
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

  const loadMoreProjectGroup = useCallback(
    async (groupKey: string) => {
      const column = projectGroups.find((group) => group.key === groupKey);
      const last = column?.tasks.at(-1);
      if (!last || !queryHash || !viewId) return;
      const next = await workAttentionService.savedViewEvaluate({
        afterId: last.id,
        groupKey,
        id: viewId,
        queryHash,
      });
      setProjectGroupTail((current) =>
        mergeWorkQueryGroups(
          current,
          (next.data.evaluation.projectGroups ?? []).map((group) => ({
            hasMore: group.hasMore,
            key: group.key,
            tasks: group.projects,
            total: group.total,
          })),
        ),
      );
    },
    [projectGroups, queryHash, viewId],
  );

  const saveView = useCallback(async () => {
    if (!viewId || !view || !draft || !shareReady) return;
    const trimmed = draft.name.trim();
    if (!trimmed) return;
    try {
      await workAttentionService.savedViewUpdate({
        expectedDefinitionVersion: draftBase ?? view.definitionVersion,
        id: viewId,
        layout: draft.layout,
        name: trimmed,
        query: draftQuery(draft),
        ...savedViewSharePatch(draft.visibility, draft.teamId),
      });
      setConflict(false);
      await refreshView();
      toast.success(t('savedViews.saved'));
    } catch (error) {
      if (isTrpcErrorCode(error, 'CONFLICT')) {
        setConflict(true);
        return;
      }
      toast.error(t('savedViews.saveFailed'));
    }
  }, [draft, draftBase, refreshView, shareReady, t, view, viewId]);

  const saveCopy = useCallback(async () => {
    if (!view || !draft) return;
    try {
      const created = await workAttentionService.savedViewCreate({
        entityType: view.entityType,
        layout: draft.layout,
        name: savedViewCopyName(savedViewTitle(view.id, draft.name || view.name, t), t('copy')),
        query: draftQuery(draft),
        visibility: 'private',
      });
      await mutate(workAttentionKeys.savedViews(workspaceId));
      navigate(`/views/${created.data.id}`);
    } catch {
      toast.error(t('savedViews.saveAsFailed'));
    }
  }, [draft, navigate, t, view, workspaceId]);

  const reloadDraft = useCallback(() => {
    if (!view) return;
    setDraft(viewToEditorState(view));
    setDraftBase(view.definitionVersion);
    setConflict(false);
  }, [view]);

  const deleteView = useCallback(() => {
    if (!viewId || !view) return;
    confirmModal({
      cancelText: t('cancel'),
      content: t('savedViews.deleteConfirm', { name: view.name }),
      okButtonProps: { danger: true },
      okText: t('delete'),
      onOk: async () => {
        try {
          await workAttentionService.savedViewDelete(viewId);
          await mutate(workAttentionKeys.savedViews(workspaceId));
          await mutate(workAttentionKeys.favorites(workspaceId));
          navigate('/views');
        } catch {
          toast.error(t('savedViews.deleteFailed'));
        }
      },
      title: t('savedViews.delete'),
    });
  }, [navigate, t, view, viewId, workspaceId]);

  const moreMenuItems = useMemo(
    () => [
      { key: 'copy', label: t('savedViews.saveAs'), onClick: () => void saveCopy() },
      ...(isOwner
        ? [
            {
              danger: true,
              key: 'delete',
              label: t('savedViews.delete'),
              onClick: deleteView,
            },
          ]
        : []),
    ],
    [deleteView, isOwner, saveCopy, t],
  );

  const projectBoard =
    view?.entityType === 'project' && (evaluation?.layout ?? view?.layout) === 'board';

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
            {view ? (
              <DropdownMenu items={moreMenuItems} placement="bottomRight">
                <Button icon={EllipsisIcon} size="small" />
              </DropdownMenu>
            ) : null}
          </Flexbox>
        }
      />
      <Flexbox gap={12} padding={16} style={{ overflow: 'auto' }}>
        {conflict ? (
          <Alert
            showIcon
            description={t('savedViews.conflictDesc')}
            title={t('savedViews.conflictTitle')}
            type="warning"
            action={
              <Flexbox horizontal gap={8}>
                <Button size="small" onClick={reloadDraft}>
                  {t('savedViews.conflictReload')}
                </Button>
                <Button size="small" onClick={() => void saveCopy()}>
                  {t('savedViews.saveAs')}
                </Button>
              </Flexbox>
            }
          />
        ) : null}
        {isOwner && editing && draft ? (
          <Flexbox gap={12}>
            <ViewDefinitionEditor showName showShare value={draft} onChange={setDraft} />
            <Flexbox horizontal gap={8}>
              <Button
                disabled={!dirty || !shareReady || !draft.name.trim()}
                size="small"
                type="primary"
                onClick={() => void saveView()}
              >
                {t('save')}
              </Button>
              <Button size="small" onClick={reloadDraft}>
                {t('cancel')}
              </Button>
            </Flexbox>
          </Flexbox>
        ) : null}
        {error ? (
          <AsyncError
            error={error}
            variant={view ? 'inline' : 'block'}
            onRetry={() => void refreshView()}
          />
        ) : null}
        {error && !view ? null : evaluation?.needsRepair ? (
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
            ) : projectBoard ? (
              <SavedViewProjectBoard
                groups={projectGroups}
                loadMoreLabel={t('savedViews.loadMore')}
                onLoadMoreGroup={loadMoreProjectGroup}
              />
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
            {!projectBoard && workQueryHasMore(projectRows.length, evaluation?.total) ? (
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
            layout={evaluation?.layout ?? view?.layout ?? 'list'}
            loadMoreLabel={t('savedViews.loadMore')}
            loading={isLoading}
            loadingLabel={t('savedViews.loading')}
            movable={(evaluation?.layout ?? view?.layout) === 'board'}
            tasks={tasks}
            total={evaluation?.total}
            createContext={
              workspaceId && joinedTeamOptions.length > 0
                ? { teamOptions: joinedTeamOptions }
                : undefined
            }
            onLoadMoreGroup={(key) => void loadMoreGroup(key)}
            onMoved={() => void refreshView()}
            onLoadMore={
              (evaluation?.layout ?? view?.layout) === 'list' ? () => void loadMore() : undefined
            }
          />
        )}
      </Flexbox>
    </Flexbox>
  );
});

SavedViewPage.displayName = 'SavedViewPage';

export default SavedViewPage;
