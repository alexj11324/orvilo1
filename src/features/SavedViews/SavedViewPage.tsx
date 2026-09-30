'use client';

import type { SavedViewItem } from '@orvilo/database/schemas';
import {
  normalizeWorkQuerySubGroupBy,
  type SavedViewVisibility,
  type WorkQuery,
} from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import dayjs from 'dayjs';
import {
  FilterIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  Settings2Icon,
  TriangleAlert,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import useSWR from 'swr';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import ActionIcon from '@/components/ActionIcon';
import AsyncError from '@/components/AsyncError';
import { resolveProjectStatus } from '@/components/ExecutionStatus';
import { confirmModal } from '@/components/Modal';
import SimpleEmpty from '@/components/SimpleEmpty';
import { toast } from '@/components/toast';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { COLUMN_I18N_KEYS } from '@/features/AgentTasks/AgentTaskList/kanbanBoardModel';
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
import { PROJECT_ENTITY_ICON } from '@/features/Projects/ProjectIcon';
import { ProjectStatusIcon } from '@/features/Projects/ProjectStatusIcon';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { WorkSurface, WorkSurfaceToolbar } from '@/features/WorkSurface';
import { useAppOrigin } from '@/hooks/useAppOrigin';
import { usePagedLoadMore } from '@/hooks/usePagedLoadMore';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { lambdaClient } from '@/libs/trpc/client';
import { workAttentionService } from '@/services/workAttention';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';
import { isTrpcErrorCode } from '@/utils/trpcError';

import SavedViewActionsMenu from './SavedViewActionsMenu';
import { type SavedViewControl, transitionSavedViewControl } from './savedViewControlState';
import { buildSavedViewCsv, fetchAllSavedViewRows, SAVED_VIEW_CSV_MAX_ROWS } from './savedViewCsv';
import SavedViewDetailsPanel from './SavedViewDetailsPanel';
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
  controlPopover: css`
    width: min(420px, calc(100vw - 32px));
    padding: 12px;
  `,
  detailLayout: css`
    position: relative;

    overflow: hidden;
    display: flex;
    flex: 1;

    height: 0;
    min-height: 0;
  `,
  detailPane: css`
    overflow-y: auto;
    flex: none;

    width: 400px;
    padding: 12px;
    border-inline-start: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgLayout};

    @container work-surface (max-width: 900px) {
      position: absolute;
      z-index: 10;
      inset-block: 0;
      inset-inline-end: 0;

      width: min(400px, calc(100% - 40px));

      box-shadow: ${cssVar.boxShadowSecondary};
    }
  `,
  resultsBody: css`
    box-sizing: border-box;
    min-height: 100%;
    padding-block: 8px;
    padding-inline: 16px;
  `,
  resultsScroll: css`
    overflow: auto;
    overscroll-behavior: contain;
    flex: 1;
    min-width: 0;
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

  return (
    <div className={cx('flex flex-row items-center', styles.row)}>
      <WorkspaceLink className={styles.link} to={savedViewProjectPath(project)}>
        <SimpleTooltip title={t(`status.${status}`)}>
          <ProjectStatusIcon size={16} status={status} />
        </SimpleTooltip>
        <div className="flex flex-col flex-1" style={{ minWidth: 0 }}>
          <div className="truncate block font-medium">{project.name}</div>
        </div>
        {project.identifier ? (
          <div className={cn('text-[12px]', styles.identifier)}>{project.identifier}</div>
        ) : null}
        {project.updatedAt ? (
          <div
            className={cn('text-[12px]', styles.updatedAt)}
            title={dayjs(project.updatedAt).format('YYYY-MM-DD HH:mm')}
          >
            {dayjs(project.updatedAt).fromNow()}
          </div>
        ) : null}
      </WorkspaceLink>
    </div>
  );
});

SavedViewProjectRow.displayName = 'SavedViewProjectRow';

/** Read-only status board for project views — the kanban columns Linear
 *  renders for project status. Project cards are not draggable here:
 *  status changes flow through the project surface. */
const SavedViewProjectBoard = memo<{
  groups: WorkQueryGroupPage<SavedViewProjectRowData>[];
  /** Per-column tail-page failures keyed by group key — swaps that column's
   *  load-more button for an inline retry scoped to the failed page. */
  loadMoreGroupErrors?: Record<string, unknown>;
  loadMoreLabel: string;
  onLoadMoreGroup?: (key: string) => void;
  onRetryLoadMoreGroup?: (key: string) => void;
}>(({ groups, loadMoreGroupErrors, loadMoreLabel, onLoadMoreGroup, onRetryLoadMoreGroup }) => {
  const { t } = useTranslation('project');
  return (
    <div className="flex flex-row items-start gap-3" style={{ overflowX: 'auto' }}>
      {groups.map((group) => {
        const status = resolveProjectStatus(group.key);
        return (
          <div className={cx('flex flex-col', styles.boardColumn)} key={group.key}>
            <div className={cx('flex flex-row', styles.boardColumnHeader)}>
              <ProjectStatusIcon size={14} status={status} />
              <div className="text-[13px] font-medium">{t(`status.${status}`)}</div>
              <div className="text-[12px] text-muted-foreground">{group.total}</div>
            </div>
            <div className={cx('flex flex-col', styles.boardColumnBody)}>
              {group.tasks.map((project) => (
                <SavedViewProjectRow key={project.id} project={project} />
              ))}
              {loadMoreGroupErrors?.[group.key] ? (
                <AsyncError
                  error={loadMoreGroupErrors[group.key]}
                  variant={'inline'}
                  onRetry={onRetryLoadMoreGroup ? () => onRetryLoadMoreGroup(group.key) : undefined}
                />
              ) : group.hasMore && onLoadMoreGroup ? (
                <Button size="sm" onClick={() => onLoadMoreGroup(group.key)}>
                  {loadMoreLabel}
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
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
  sortMode: view.queryAst.sortMode,
  subGroupBy: view.queryAst.subGroupBy,
  teamId: view.teamId ?? null,
  visibility: view.visibility ?? 'private',
});

const draftQuery = (state: ViewEditorState): WorkQuery => ({
  entityType: state.entityType,
  filter: builderToFilter(state.entityType, state.builder),
  groupBy: state.groupBy === 'none' ? undefined : state.groupBy,
  schemaVersion: 1,
  sort: state.sort,
  // Board ordering is explicit — the field is meaningless off-board.
  sortMode: state.layout === 'board' ? state.sortMode : undefined,
  subGroupBy:
    state.layout === 'board'
      ? normalizeWorkQuerySubGroupBy(state.groupBy, state.subGroupBy)
      : undefined,
});

const SavedViewPage = memo(() => {
  const { t } = useTranslation('common');
  const { viewId } = useParams<{ viewId: string }>();
  const workspaceId = useActiveWorkspaceId();
  const workspaceSlug = useActiveWorkspaceSlug();
  const origin = useAppOrigin();
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
    // Neutral key shared with MyWorkPage — same fetcher, one cache entry.
    workspaceId && currentUserId ? ['work-joined-teams', currentUserId, workspaceId] : null,
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
  const pagedMore = usePagedLoadMore();
  useEffect(() => {
    setTail([]);
    setProjectTail([]);
    setGroupTail([]);
    setProjectGroupTail([]);
    pagedMore.resetLoadMoreError();
  }, [pagedMore.resetLoadMoreError, queryHash, viewId, workspaceId]);
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
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [openControl, setOpenControl] = useState<SavedViewControl | null>(null);

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

  const saveView = useCallback(async (): Promise<boolean> => {
    if (!viewId || !view || !draft || !shareReady) return false;
    const trimmed = draft.name.trim();
    if (!trimmed) return false;
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
      return true;
    } catch (error) {
      if (isTrpcErrorCode(error, 'CONFLICT')) {
        setConflict(true);
        return false;
      }
      toast.error(t('savedViews.saveFailed'));
      return false;
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

  /* Menu "Duplicate view" copies the persisted definition — unsaved draft
     edits stay out of the copy (the draft-based saveCopy remains the
     conflict-resolution escape hatch). */
  const duplicateView = useCallback(async () => {
    if (!view) return;
    try {
      const created = await workAttentionService.savedViewCreate({
        entityType: view.entityType,
        layout: view.layout,
        name: savedViewCopyName(savedViewTitle(view.id, view.name, t), t('copy')),
        query: view.queryAst,
        visibility: 'private',
      });
      await mutate(workAttentionKeys.savedViews(workspaceId));
      navigate(`/views/${created.data.id}`);
    } catch {
      toast.error(t('savedViews.saveAsFailed'));
    }
  }, [navigate, t, view, workspaceId]);

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

  const moveViewTo = useCallback(
    async (visibility: SavedViewVisibility, teamId?: string) => {
      if (!viewId || !view) return;
      try {
        await workAttentionService.savedViewUpdate({
          expectedDefinitionVersion: view.definitionVersion,
          id: viewId,
          ...savedViewSharePatch(visibility, teamId ?? null),
        });
        setConflict(false);
        await refreshView();
        toast.success(t('savedViews.saved'));
      } catch (error) {
        if (isTrpcErrorCode(error, 'CONFLICT')) {
          setConflict(true);
          reloadDraft();
        } else {
          toast.error(t('savedViews.moveFailed'));
        }
      }
    },
    [refreshView, reloadDraft, t, view, viewId],
  );

  const copyLink = useCallback(async () => {
    if (!viewId) return;
    try {
      const href = buildWorkspaceAwarePath(`/views/${viewId}`, workspaceSlug);
      await navigator.clipboard.writeText(`${origin}${href}`);
      toast.success(t('savedViews.linkCopied'));
    } catch {
      toast.error(t('savedViews.linkCopyFailed'));
    }
  }, [origin, t, viewId, workspaceSlug]);

  const exportCsv = useCallback(async () => {
    if (!viewId || !view || exporting) return;
    setExporting(true);
    try {
      const { rows, truncated } = await fetchAllSavedViewRows(viewId);
      const csv = buildSavedViewCsv(view.entityType, rows, {
        priority: (value) => t(`savedViews.values.priority.${value ?? 0}` as never),
        status: (value) =>
          value && COLUMN_I18N_KEYS[value]
            ? t(COLUMN_I18N_KEYS[value] as never, { ns: 'chat' })
            : (value ?? ''),
      });
      const filename = `${(view.name || 'view').replaceAll(/[\\/:*?"<>|]+/g, '-')}.csv`;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      if (truncated) {
        toast.warning(
          t('savedViews.exportCsvTruncated', {
            count: SAVED_VIEW_CSV_MAX_ROWS,
          }),
        );
      } else {
        toast.success(t('savedViews.exportCsvDone'));
      }
    } catch {
      toast.error(t('savedViews.exportCsvFailed'));
    } finally {
      setExporting(false);
    }
  }, [exporting, t, view, viewId]);

  const projectBoard =
    view?.entityType === 'project' && (evaluation?.layout ?? view?.layout) === 'board';
  const resolvedLayout = evaluation?.layout ?? view?.layout ?? 'list';
  const boardActive = resolvedLayout === 'board';
  const viewTitle = view ? savedViewTitle(view.id, view.name, t) : t('tab.views');
  const detailGroups = view?.entityType === 'project' ? projectGroups : groups;

  const closeEditors = useCallback(() => {
    setOpenControl(null);
  }, []);

  const cancelDraft = useCallback(() => {
    reloadDraft();
    closeEditors();
  }, [closeEditors, reloadDraft]);

  const commitDraft = useCallback(async () => {
    if (await saveView()) closeEditors();
  }, [closeEditors, saveView]);

  const handleControlOpenChange = useCallback(
    (control: SavedViewControl, open: boolean) => {
      const transition = transitionSavedViewControl(openControl, control, open);
      if (transition.resetDraft) reloadDraft();
      setOpenControl(transition.next);
    },
    [openControl, reloadDraft],
  );

  return (
    <WorkSurface>
      <NavHeader
        left={
          <div className="font-medium" style={{ paddingInlineStart: 4 }}>
            {viewTitle}
          </div>
        }
        right={
          <div className="flex flex-row gap-2">
            <WorkFavoriteButton targetId={viewId} targetType="savedView" />
            {view ? (
              <SavedViewActionsMenu
                canEdit={isOwner}
                dirty={dirty}
                draft={draft}
                exporting={exporting}
                shareReady={shareReady}
                teamOptions={joinedTeamOptions}
                workspaceId={workspaceId}
                onCancelDraft={cancelDraft}
                onCopyLink={() => void copyLink()}
                onDelete={deleteView}
                onDraftChange={setDraft}
                onDuplicate={() => void duplicateView()}
                onExportCsv={() => void exportCsv()}
                onMoveTo={(visibility, teamId) => void moveViewTo(visibility, teamId)}
                onReloadDraft={reloadDraft}
                onSave={saveView}
              />
            ) : null}
          </div>
        }
      />
      <WorkSurfaceToolbar>
        <div className="text-[12px] text-muted-foreground">
          {t('savedViews.resultCount', { count: evaluation?.total ?? 0 })}
        </div>
        <div
          className="flex flex-row items-center gap-1.5"
          style={{ flex: 'none', marginInlineStart: 'auto' }}
        >
          {isOwner && draft ? (
            <>
              <Popover
                open={openControl === 'filters'}
                onOpenChange={(open) => handleControlOpenChange('filters', open)}
              >
                <PopoverContent align="end" className="w-auto p-2" side="bottom">
                  <div className={cx('flex flex-col gap-3', styles.controlPopover)}>
                    <ViewDefinitionEditor showDisplay={false} value={draft} onChange={setDraft} />
                    <div className="flex flex-row gap-2 justify-end">
                      <Button size="sm" onClick={cancelDraft}>
                        {t('cancel')}
                      </Button>
                      <Button
                        disabled={!dirty || !shareReady || !draft.name.trim()}
                        size="sm"
                        variant="default"
                        onClick={() => void commitDraft()}
                      >
                        {t('save')}
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
                <PopoverTrigger
                  render={
                    <ActionIcon
                      aria-expanded={openControl === 'filters'}
                      aria-label={t('savedViews.filters.add')}
                      icon={FilterIcon}
                      size="small"
                      title={t('savedViews.filters.add')}
                    />
                  }
                />
              </Popover>
              <Popover
                open={openControl === 'display'}
                onOpenChange={(open) => handleControlOpenChange('display', open)}
              >
                <PopoverContent align="end" className="w-auto p-2" side="bottom">
                  <div className={cx('flex flex-col gap-3', styles.controlPopover)}>
                    <ViewDefinitionEditor showFilters={false} value={draft} onChange={setDraft} />
                    <div className="flex flex-row gap-2 justify-end">
                      <Button size="sm" onClick={cancelDraft}>
                        {t('cancel')}
                      </Button>
                      <Button
                        disabled={!dirty || !shareReady || !draft.name.trim()}
                        size="sm"
                        variant="default"
                        onClick={() => void commitDraft()}
                      >
                        {t('save')}
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
                <PopoverTrigger
                  render={
                    <ActionIcon
                      aria-expanded={openControl === 'display'}
                      aria-label={t('savedViews.displayOptions')}
                      icon={Settings2Icon}
                      size="small"
                      title={t('savedViews.displayOptions')}
                    />
                  }
                />
              </Popover>
            </>
          ) : null}
          <ActionIcon
            aria-expanded={detailsOpen}
            icon={detailsOpen ? PanelRightCloseIcon : PanelRightOpenIcon}
            size="small"
            title={t(detailsOpen ? 'savedViews.closeViewDetails' : 'savedViews.openViewDetails')}
            aria-label={t(
              detailsOpen ? 'savedViews.closeViewDetails' : 'savedViews.openViewDetails',
            )}
            onClick={() => setDetailsOpen((open) => !open)}
          />
        </div>
      </WorkSurfaceToolbar>
      <div className={styles.detailLayout}>
        <div className={styles.resultsScroll}>
          <div
            className={styles.resultsBody}
            style={
              boardActive ? { display: 'flex', flexDirection: 'column', height: '100%' } : undefined
            }
          >
            <div
              className="flex flex-col gap-3"
              style={boardActive ? { flex: 1, minHeight: 0 } : undefined}
            >
              {conflict ? (
                <Alert variant="warning">
                  <TriangleAlert />
                  <AlertTitle>{t('savedViews.conflictTitle')}</AlertTitle>
                  <AlertDescription>{t('savedViews.conflictDesc')}</AlertDescription>
                  <AlertAction>
                    {
                      <div className="flex flex-row gap-2">
                        <Button size="sm" onClick={reloadDraft}>
                          {t('savedViews.conflictReload')}
                        </Button>
                        <Button size="sm" onClick={() => void saveCopy()}>
                          {t('savedViews.saveAs')}
                        </Button>
                      </div>
                    }
                  </AlertAction>
                </Alert>
              ) : null}
              {error ? (
                <AsyncError
                  error={error}
                  variant={view ? 'inline' : 'block'}
                  onRetry={() => void refreshView()}
                />
              ) : null}
              {error && !view ? null : evaluation?.needsRepair ? (
                <Alert variant="warning">
                  <TriangleAlert />
                  <AlertTitle>{t('savedViews.needsRepair')}</AlertTitle>
                  <AlertDescription>{t('savedViews.needsRepairDesc')}</AlertDescription>
                </Alert>
              ) : null}
              {evaluation?.needsRepair ? (
                isLoading ? (
                  <div className="text-muted-foreground">{t('savedViews.loading')}</div>
                ) : (
                  <SimpleEmpty description={t('savedViews.needsRepairEmpty')} />
                )
              ) : view?.entityType === 'project' ? (
                <div className="flex flex-col gap-4">
                  {isLoading ? (
                    <SkeletonList aria-label={t('savedViews.loading')} rows={8} />
                  ) : projectBoard ? (
                    <SavedViewProjectBoard
                      groups={projectGroups}
                      loadMoreGroupErrors={pagedMore.loadMoreGroupErrors}
                      loadMoreLabel={t('savedViews.loadMore')}
                      onRetryLoadMoreGroup={pagedMore.retryLoadMoreGroup}
                      onLoadMoreGroup={(key) =>
                        pagedMore.runLoadMoreGroup(key, () => loadMoreProjectGroup(key))
                      }
                    />
                  ) : projectRows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center flex-1 p-12">
                      <SimpleEmpty
                        description={t('savedViews.emptyResults')}
                        icon={PROJECT_ENTITY_ICON}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {projectRows.map((project) => (
                        <SavedViewProjectRow key={project.id} project={project} />
                      ))}
                    </div>
                  )}
                  {pagedMore.loadMoreError ? (
                    <AsyncError
                      error={pagedMore.loadMoreError}
                      variant={'inline'}
                      onRetry={pagedMore.retryLoadMore}
                    />
                  ) : null}
                  {!projectBoard && workQueryHasMore(projectRows.length, evaluation?.total) ? (
                    <div className="flex flex-row justify-center">
                      <Button size="sm" onClick={() => pagedMore.runLoadMore(loadMore)}>
                        {t('savedViews.loadMore')}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <WorkQueryResults
                  emptyLabel={t('savedViews.emptyResults')}
                  groupBy={evaluation?.groupBy}
                  groups={groups}
                  layout={resolvedLayout}
                  loadMoreError={pagedMore.loadMoreError}
                  loadMoreGroupErrors={pagedMore.loadMoreGroupErrors}
                  loadMoreLabel={t('savedViews.loadMore')}
                  loading={isLoading}
                  loadingLabel={t('savedViews.loading')}
                  movable={resolvedLayout === 'board'}
                  sortMode={view?.queryAst.sortMode}
                  subGroupBy={view?.queryAst.subGroupBy}
                  tasks={tasks}
                  total={evaluation?.total}
                  createContext={
                    workspaceId && joinedTeamOptions.length > 0
                      ? { teamOptions: joinedTeamOptions }
                      : undefined
                  }
                  onMoved={() => void refreshView()}
                  onRetryLoadMore={pagedMore.retryLoadMore}
                  onRetryLoadMoreGroup={pagedMore.retryLoadMoreGroup}
                  onLoadMore={
                    resolvedLayout === 'list' ? () => pagedMore.runLoadMore(loadMore) : undefined
                  }
                  onLoadMoreGroup={(key) =>
                    pagedMore.runLoadMoreGroup(key, () => loadMoreGroup(key))
                  }
                />
              )}
            </div>
          </div>
        </div>
        {detailsOpen && view ? (
          <aside aria-label={t('savedViews.viewDetails')} className={styles.detailPane}>
            <SavedViewDetailsPanel
              groupBy={evaluation?.groupBy}
              groups={detailGroups}
              layout={resolvedLayout}
              title={viewTitle}
              total={evaluation?.total}
              view={view}
            />
          </aside>
        ) : null}
      </div>
    </WorkSurface>
  );
});

SavedViewPage.displayName = 'SavedViewPage';

export default SavedViewPage;
