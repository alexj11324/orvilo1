'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { TabsIndicator, TabsList, TabsRoot, TabsTab, Tag, Text, toast } from '@lobehub/ui/base-ui';
import { type MyWorkMode, type WorkQueryLayout } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { FolderIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router';
import useSWR from 'swr';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import AsyncError from '@/components/AsyncError';
import { createTaskModal } from '@/features/AgentTasks/CreateTaskModal';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import NavHeader from '@/features/NavHeader';
import type { BuilderState } from '@/features/SavedViews/workQueryBuilder';
import { builderToFilter, stableStringify } from '@/features/SavedViews/workQueryBuilder';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { WorkSurface, WorkSurfaceCollection, WorkSurfaceToolbar } from '@/features/WorkSurface';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { lambdaClient } from '@/libs/trpc/client';
import { workAttentionService } from '@/services/workAttention';
import { useCurrentProjectList, useProjectStore } from '@/store/project';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import MyWorkControls from './MyWorkControls';
import {
  activityDayTitle,
  defaultMyWorkDisplay,
  filterMyWorkTaskRows,
  type MyWorkDisplay,
  myWorkDisplayFiltersRows,
  myWorkListGroupingOptions,
  myWorkOrderingOptions,
  myWorkServerGroupBy,
  sortTasksByImportance,
  workQueryActivitySections,
} from './myWorkDisplay';
import {
  EMPTY_FILTER_BUILDER,
  myWorkActiveFilterCount,
  myWorkComposedQuery,
  workQueryFilterHasPredicates,
} from './myWorkFilters';
import MyWorkIssuePane from './MyWorkIssuePane';
import { isMyWorkSaveableMode } from './myWorkSaveAs';
import { isTaskFollowed } from './myWorkSubscribe';
import { isMyWorkBoardMode } from './workQueryBoard';
import {
  mergeWorkQueryGroups,
  mergeWorkQueryPage,
  type WorkQueryResultTask,
} from './workQueryPaging';
import WorkQueryResults from './WorkQueryResults';

const styles = createStaticStyles(({ css }) => ({
  /**
   * Peek layout mirrors the saved-view page: list keeps its flexible width,
   * the detail pane is a fixed 400px column that overlays under 900px of
   * surface width (Linear's My issues proportions).
   */
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
    padding-block-end: 12px;
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
  filterChips: css`
    padding-block: 4px;
    padding-inline: 4px;
  `,
  resultsBody: css`
    box-sizing: border-box;
    min-height: 100%;
    padding-block: 8px;
  `,
  resultsScroll: css`
    overflow: auto;
    overscroll-behavior: contain;
    flex: 1;
    min-width: 0;
  `,
}));

// Board mode bounds the collection body to the scrollport so the kanban's own
// column scrollers engage; list mode lets the body grow and the scroll host
// stays the single scroll owner. The split pane uses the same bounding so
// each side owns its own scroll.
const boundedBodyStyle = {
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  paddingBlock: 0,
  paddingInline: 0,
} as const;

const listBodyStyle = { paddingInline: 0 } as const;

/**
 * My issues tabs (v5 contract): Assigned / Created / Subscribed / Activity.
 * Delegation is a filter chip (`?delegated=1`), never a tab; review work
 * lives on `/reviews` — the `/my-work` route redirect already maps the old
 * `tab=delegated|review` deep links.
 */
const MY_ISSUES_TABS: MyWorkMode[] = ['assigned', 'created', 'subscribed', 'activity'];

const resolveMode = (value: string | null): MyWorkMode => {
  if (value === 'delegated') return 'activity';
  if (value && (MY_ISSUES_TABS as readonly string[]).includes(value)) {
    return value as MyWorkMode;
  }
  return 'assigned';
};

const resolveLayout = (mode: MyWorkMode, value: string | null): WorkQueryLayout => {
  if (!isMyWorkBoardMode(mode)) return 'list';
  return value === 'board' ? 'board' : 'list';
};

const MyWorkPage = memo(() => {
  const { t, i18n } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const workspaceSlug = useActiveWorkspaceSlug();
  const navigate = useWorkspaceAwareNavigate();
  const currentUserId = useUserStore(userProfileSelectors.userId);
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const mode = resolveMode(rawTab);
  const layout = resolveLayout(mode, searchParams.get('layout'));
  const noProject = searchParams.get('noProject') === '1';
  // `tab=delegated` implies the delegated filter even when `delegated=1` is
  // absent — the redirect writes both, this keeps hand-built URLs honest.
  const delegated = searchParams.get('delegated') === '1' || rawTab === 'delegated';
  const canBoard = isMyWorkBoardMode(mode);
  const boardActive = canBoard && layout === 'board';

  /* ----------------------- display options + filters ---------------------- */

  // Per-tab display state, kept for the session — Linear persists these per
  // tab server-side; the work-query API exposes no preference store.
  const [displayByMode, setDisplayByMode] = useState<Partial<Record<MyWorkMode, MyWorkDisplay>>>(
    {},
  );
  const display = displayByMode[mode] ?? defaultMyWorkDisplay(mode);
  const setDisplay = useCallback(
    (patch: Partial<MyWorkDisplay>) =>
      setDisplayByMode((current) => ({
        ...current,
        [mode]: { ...(current[mode] ?? defaultMyWorkDisplay(mode)), ...patch },
      })),
    [mode],
  );

  // Filter-builder rows, also per tab. Only the saveable modes can actually
  // compose them into a work query — the other tabs' membership rules live in
  // mode-injected SQL the generic query endpoint cannot express.
  const [builderByMode, setBuilderByMode] = useState<Partial<Record<MyWorkMode, BuilderState>>>({});
  const builder = builderByMode[mode] ?? EMPTY_FILTER_BUILDER;
  const setBuilder = useCallback(
    (next: BuilderState) => setBuilderByMode((current) => ({ ...current, [mode]: next })),
    [mode],
  );
  const filterSupported = isMyWorkSaveableMode(mode);
  const builderFilter = filterSupported ? builderToFilter('task', builder) : undefined;
  const hasCustomFilters = workQueryFilterHasPredicates(builderFilter);
  const activeFilterCount = myWorkActiveFilterCount(builder);

  const serverGroupBy = myWorkServerGroupBy(display, layout);
  // Extra filters or a non-default ordering reroute the feed through the
  // generic work-query endpoint — `myWork` keeps the mode's fixed sort and
  // only knows the noProject/delegated chips.
  const composedQuery = useMemo(
    () =>
      hasCustomFilters || display.ordering !== 'default'
        ? myWorkComposedQuery({
            delegated,
            filter: builderFilter,
            groupBy: serverGroupBy,
            layout,
            mode,
            noProject,
            ordering: display.ordering,
          })
        : null,
    [
      builderFilter,
      delegated,
      display.ordering,
      hasCustomFilters,
      layout,
      mode,
      noProject,
      serverGroupBy,
    ],
  );

  /* -------------------------------- fetch --------------------------------- */

  // One feed powers both layouts: list rows and the board's external groups
  // come from the same work query, so the two never disagree. The key carries
  // the resolved grouping + composed query so option changes refetch.
  const swrKey = useMemo(
    () => [
      'workAttention:myWork',
      workspaceId,
      mode,
      layout,
      noProject,
      delegated,
      serverGroupBy,
      composedQuery ? stableStringify(composedQuery) : '',
    ],
    [workspaceId, mode, layout, noProject, delegated, serverGroupBy, composedQuery],
  );
  const { data, error, isLoading } = useClientDataSWR(swrKey, () =>
    composedQuery
      ? workAttentionService.query({ query: composedQuery })
      : workAttentionService.myWork({
          delegated,
          groupBy: serverGroupBy,
          layout,
          mode,
          noProject,
        }),
  );
  const firstTasks = data?.data.tasks ?? [];
  const firstGroups = data?.data.groups ?? [];
  const queryHash = data?.data.queryHash;
  const [groupTail, setGroupTail] = useState<typeof firstGroups>([]);
  const [taskTail, setTaskTail] = useState<typeof firstTasks>([]);
  const [extraSubscribed, setExtraSubscribed] = useState<string[]>([]);
  useEffect(() => {
    setGroupTail([]);
    setTaskTail([]);
    setExtraSubscribed([]);
  }, [layout, mode, noProject, queryHash, serverGroupBy, workspaceId]);
  const tasks = mergeWorkQueryPage(firstTasks, taskTail);
  const groups = mergeWorkQueryGroups(firstGroups, groupTail);
  // The generic query endpoint does not return subscription state — the
  // follow bells degrade to "unfollowed" on a filtered/ordered feed.
  const subscribedTaskIds = [
    ...((data?.data as { subscribedTaskIds?: string[] } | undefined)?.subscribedTaskIds ?? []),
    ...extraSubscribed,
  ];
  const canSaveAs = isMyWorkSaveableMode(mode);

  const refresh = useCallback(async () => {
    setGroupTail([]);
    setTaskTail([]);
    await mutate(swrKey);
  }, [swrKey]);

  /** Page the next batch for either endpoint — same cursor contract. */
  const fetchNextPage = useCallback(
    async (input: { afterId: string; groupKey?: string }) =>
      composedQuery
        ? workAttentionService.query({
            afterId: input.afterId,
            groupKey: input.groupKey,
            query: composedQuery,
            queryHash,
          })
        : workAttentionService.myWork({
            afterId: input.afterId,
            delegated,
            groupBy: serverGroupBy,
            groupKey: input.groupKey,
            layout,
            mode,
            noProject,
            queryHash,
          }),
    [composedQuery, delegated, layout, mode, noProject, queryHash, serverGroupBy],
  );

  const loadMoreGroup = useCallback(
    async (groupKey: string) => {
      const column = groups.find((group) => group.key === groupKey);
      const last = column?.tasks.at(-1);
      if (!last || !queryHash) return;
      const next = await fetchNextPage({ afterId: last.id, groupKey });
      setGroupTail((current) => mergeWorkQueryGroups(current, next.data.groups ?? []));
      setExtraSubscribed((current) => [
        ...current,
        ...((next.data as { subscribedTaskIds?: string[] }).subscribedTaskIds ?? []),
      ]);
    },
    [fetchNextPage, groups, queryHash],
  );

  // Flat lists page by the last row's id — needed now that Created/Subscribed
  // default to `none` grouping instead of per-status groups.
  const loadMore = useCallback(async () => {
    const last = tasks.at(-1);
    if (!last || !queryHash) return;
    const next = await fetchNextPage({ afterId: last.id });
    setTaskTail((current) => mergeWorkQueryPage(current, next.data.tasks ?? []));
    setExtraSubscribed((current) => [
      ...current,
      ...((next.data as { subscribedTaskIds?: string[] }).subscribedTaskIds ?? []),
    ]);
  }, [fetchNextPage, queryHash, tasks]);

  /* ----------------------------- display pass ----------------------------- */

  // Display filters (completed window, sub-issues, triage) and Assigned's
  // importance ordering are presentation-only passes over the loaded page.
  const importanceOrdered = mode === 'assigned' && display.ordering === 'default' && !boardActive;
  const displayFiltersRows = myWorkDisplayFiltersRows(display);
  const displayTasks = useMemo(() => {
    const filtered = filterMyWorkTaskRows(tasks, display);
    return importanceOrdered ? sortTasksByImportance(filtered) : filtered;
  }, [display, importanceOrdered, tasks]);
  const displayGroups = useMemo(
    () =>
      groups.map((group) => {
        const filteredTasks = filterMyWorkTaskRows(group.tasks, display);
        return {
          ...group,
          tasks: importanceOrdered ? sortTasksByImportance(filteredTasks) : filteredTasks,
          // A display-filtered group counts what it actually shows.
          total: displayFiltersRows ? filteredTasks.length : group.total,
        };
      }),
    [display, displayFiltersRows, groups, importanceOrdered],
  );

  // Activity groups by day — the work-query enum has no activity-date
  // dimension, so the flat activity-ordered feed is bucketed locally by
  // `updatedAt` day (the row carries no notification timestamp).
  const flatSections = useMemo(() => {
    if (layout !== 'list' || display.grouping !== 'activityDate') return undefined;
    const labels = {
      today: t('time.today'),
      unknown: t('myWork.unknownDate'),
      yesterday: t('time.yesterday'),
    };
    return workQueryActivitySections(displayTasks).map((section) => ({
      ...section,
      title: activityDayTitle(section.key, { labels, locale: i18n.language }),
    }));
  }, [display.grouping, displayTasks, i18n.language, layout, t]);

  /* --------------------------- selection + peek --------------------------- */

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<WorkQueryResultTask | null>(null);
  // A selection is only meaningful inside the list it came from — switching
  // tabs, layout or the effective query drops it.
  useEffect(() => {
    setSelected(null);
  }, [mode, layout, serverGroupBy, queryHash]);

  const peekOnSelect = detailsOpen && !boardActive;
  const detailVisible = peekOnSelect && selected !== null;
  const openTaskPage = useCallback(
    (task: Pick<WorkQueryResultTask, 'identifier' | 'name'>) => {
      navigate(taskDetailPath(task.identifier, undefined, task.name));
    },
    [navigate],
  );

  /* --------------------------- teams + projects ---------------------------- */

  // Cross-team create asks the one ambiguous choice — same pattern the saved
  // view board uses.
  const { data: teamsData } = useSWR(
    workspaceId && currentUserId ? ['mywork-joined-teams', currentUserId, workspaceId] : null,
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

  // Project chips resolve names through the cached project list — the row
  // model carries `projectId` only, and an unknown project renders no chip.
  useProjectStore((s) => s.useFetchProjectList)(Boolean(workspaceId));
  const projects = useCurrentProjectList();
  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projects) {
      if (project.name) map.set(project.id, project.name);
    }
    return map;
  }, [projects]);
  const rowExtras = useCallback(
    (task: WorkQueryResultTask) => {
      const name = task.projectId ? projectNameById.get(task.projectId) : undefined;
      if (!name) return null;
      return (
        <Flexbox flex="none">
          <Tag icon={<Icon icon={FolderIcon} size={12} />} size="small" variant="outlined">
            {name}
          </Tag>
        </Flexbox>
      );
    },
    [projectNameById],
  );

  /* -------------------------------- actions ------------------------------- */

  const tabs = useMemo(
    () =>
      MY_ISSUES_TABS.map((item) => ({
        key: item,
        label: String(t(`myWork.${item}` as never)),
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

  const createInGroup = useCallback(() => {
    createTaskModal({
      onCreated: (task) => {
        navigate(taskDetailPath(task.identifier, task.agentId ?? undefined, task.name));
      },
      showInlineToggle: false,
      teamOptions: joinedTeamOptions,
    });
  }, [joinedTeamOptions, navigate]);

  const saveCopy = useCallback(async () => {
    if (!isMyWorkSaveableMode(mode)) return;
    const query = myWorkComposedQuery({
      delegated,
      filter: builderFilter,
      groupBy: serverGroupBy,
      layout,
      mode,
      noProject,
      ordering: display.ordering,
    });
    if (!query) return;
    try {
      const created = await workAttentionService.savedViewCreate({
        entityType: 'task',
        layout: canBoard ? layout : 'list',
        name: t(`myWork.${mode}`),
        query,
        visibility: 'private',
      });
      await mutate(workAttentionKeys.savedViews(workspaceId));
      navigate(`/views/${created.data.id}`);
    } catch {
      toast.error(t('myWork.saveAsFailed'));
    }
  }, [
    builderFilter,
    canBoard,
    delegated,
    display.ordering,
    layout,
    mode,
    navigate,
    noProject,
    serverGroupBy,
    t,
    workspaceId,
  ]);

  const writeParams = (patch: {
    delegated?: boolean;
    layout?: WorkQueryLayout;
    noProject?: boolean;
    tab?: string;
  }) => {
    const nextTab = patch.tab ?? mode;
    const nextLayout = patch.layout ?? layout;
    const nextNoProject = patch.noProject ?? noProject;
    const nextDelegated = patch.delegated ?? delegated;
    setSearchParams(
      {
        tab: nextTab,
        ...(isMyWorkBoardMode(nextTab as MyWorkMode) && nextLayout === 'board'
          ? { layout: 'board' }
          : {}),
        ...(nextNoProject ? { noProject: '1' } : {}),
        ...(nextDelegated ? { delegated: '1' } : {}),
      },
      { replace: true },
    );
  };

  // `?tab=review` on the new surface is a mistyped deep link — send it to
  // Reviews rather than silently rendering Assigned.
  if (rawTab === 'review') {
    return <Navigate replace to={buildWorkspaceAwarePath('/reviews?tab=for-me', workspaceSlug)} />;
  }

  const chipsRow =
    noProject || delegated || activeFilterCount > 0 ? (
      <Flexbox horizontal align="center" className={styles.filterChips} gap={8}>
        {noProject ? (
          <Tag closable size="small" onClose={() => writeParams({ noProject: false })}>
            {t('myWork.noProject')}
          </Tag>
        ) : null}
        {delegated ? (
          <Tag closable size="small" onClose={() => writeParams({ delegated: false })}>
            {t('myWork.delegated')}
          </Tag>
        ) : null}
        {activeFilterCount > 0 ? (
          <Tag closable size="small" onClose={() => setBuilder(EMPTY_FILTER_BUILDER)}>
            {t('myWork.filtersActive', { count: activeFilterCount })}
          </Tag>
        ) : null}
      </Flexbox>
    ) : null;

  const results =
    error && tasks.length === 0 ? (
      /* A failed fetch must never render as a confident empty list —
         loaded data stays visible with an inline failure marker. */
      <AsyncError error={error} variant={'block'} onRetry={() => void refresh()} />
    ) : (
      <>
        {error ? (
          <AsyncError error={error} variant={'inline'} onRetry={() => void refresh()} />
        ) : null}
        <WorkQueryResults
          emptyLabel={t('myWork.empty')}
          flatNested={display.showSubIssues && display.nestedSubIssues}
          flatSections={flatSections}
          groupBy={data?.data.groupBy}
          groups={displayGroups}
          isFollowed={(taskId) => isTaskFollowed(taskId, mode, subscribedTaskIds)}
          layout={layout}
          loadMoreLabel={t('myWork.loadMore')}
          loading={isLoading}
          loadingLabel={t('myWork.loading')}
          peekOnSelect={peekOnSelect}
          rowExtras={rowExtras}
          selectedTaskId={selected?.identifier}
          tasks={displayTasks}
          total={data?.data.total}
          createContext={
            workspaceId && joinedTeamOptions.length > 0
              ? { teamOptions: joinedTeamOptions }
              : undefined
          }
          onCreateInGroup={createInGroup}
          onLoadMore={groups.length === 0 ? () => void loadMore() : undefined}
          onLoadMoreGroup={(key) => void loadMoreGroup(key)}
          onMoved={() => void refresh()}
          onOpenTask={openTaskPage}
          onSelectTask={setSelected}
          onToggleFollow={(taskId, followed) => void toggleFollow(taskId, followed)}
        />
      </>
    );

  return (
    <WorkSurface>
      <NavHeader
        left={
          <Text style={{ paddingInlineStart: 4 }} weight={500}>
            {t('tab.myWork')}
          </Text>
        }
      />
      <WorkSurfaceCollection
        style={boardActive || detailVisible ? boundedBodyStyle : listBodyStyle}
        toolbar={
          <WorkSurfaceToolbar
            asideLabel={t('members.filter')}
            aside={
              <MyWorkControls
                activeFilterCount={activeFilterCount}
                boardGrouping={display.boardGrouping}
                builder={builder}
                canBoard={canBoard}
                canSaveAs={canSaveAs}
                delegated={delegated}
                detailsDisabled={boardActive}
                detailsOpen={detailsOpen}
                display={display}
                filterSupported={filterSupported}
                groupingOptions={myWorkListGroupingOptions(mode)}
                layout={layout}
                mode={mode}
                noProject={noProject}
                orderingOptions={myWorkOrderingOptions(mode)}
                onBuilderChange={setBuilder}
                onDelegatedChange={(checked) => writeParams({ delegated: checked })}
                onDisplayChange={setDisplay}
                onLayoutChange={(next) => writeParams({ layout: next })}
                onNoProjectChange={(checked) => writeParams({ noProject: checked })}
                onResetFilters={() => setBuilder(EMPTY_FILTER_BUILDER)}
                onSaveAs={() => void saveCopy()}
                onToggleDetails={() => setDetailsOpen((open) => !open)}
              />
            }
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
          </WorkSurfaceToolbar>
        }
      >
        {detailVisible ? (
          <div className={styles.detailLayout}>
            <div className={styles.resultsScroll}>
              <div className={styles.resultsBody}>
                {chipsRow}
                {results}
              </div>
            </div>
            <aside aria-label={t('myWork.issueDetails')} className={styles.detailPane}>
              <MyWorkIssuePane
                identifier={selected.identifier}
                onClose={() => setSelected(null)}
                onOpen={() => openTaskPage(selected)}
              />
            </aside>
          </div>
        ) : (
          <>
            {chipsRow}
            {results}
          </>
        )}
      </WorkSurfaceCollection>
    </WorkSurface>
  );
});

MyWorkPage.displayName = 'MyWorkPage';

export default MyWorkPage;
