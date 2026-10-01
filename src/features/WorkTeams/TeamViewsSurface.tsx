'use client';
import type { SavedViewItem } from '@orvilo/database/schemas';
import type { WorkQueryEntityType } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { FilterIcon, Layers2Icon, LoaderCircleIcon, PlusIcon, Settings2Icon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import WorkFavoriteButton from '@/features/HomeSidebar/Body/WorkFavoriteButton';
import { useWorkQueryGroupTitle } from '@/features/MyWork/useWorkQueryGroupTitle';
import WorkQueryResults from '@/features/MyWork/WorkQueryResults';
import NavHeader from '@/features/NavHeader';
import { filterSavedViewsByEntity } from '@/features/SavedViews/savedViewDirectory';
import { SavedViewProjectRow } from '@/features/SavedViews/SavedViewPage';
import { savedViewVisibilityKey } from '@/features/SavedViews/savedViewVisibility';
import ViewDefinitionEditor from '@/features/SavedViews/ViewDefinitionEditor';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { WorkSurface, WorkSurfaceCollection, WorkSurfaceToolbar } from '@/features/WorkSurface';
import { useSearchParams } from '@/libs/router/navigation';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { workAttentionService } from '@/services/workAttention';

import { newTeamViewDraft, teamViewDraftQuery } from './teamViewsDraft';
import { nextTeamViewsSearch, readTeamViewsSearch } from './teamViewsNavigation';

const styles = createStaticStyles(({ css }) => ({
  directoryBody: css`
    display: flex;
    flex-direction: column;
    min-height: 100%;
  `,
  editorHeader: css`
    padding-block: 16px;
    padding-inline: 24px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  empty: css`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 18px;
    align-items: center;
    justify-content: center;

    max-width: 480px;
    margin-inline: auto;
    padding-block: 48px;
    padding-inline: 20px;

    text-align: center;
  `,
  popover: css`
    width: min(420px, calc(100vw - 32px));
    padding: 12px;
  `,
  resultScroll: css`
    overflow: auto;
    flex: 1;

    min-height: 0;
    padding-block: 12px;
    padding-inline: 16px;
  `,
  viewRow: css`
    cursor: pointer;

    display: flex;
    gap: 12px;
    align-items: center;

    min-height: 44px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

interface TeamViewsSurfaceProps {
  error?: Error;
  isLoading: boolean;
  onRetry: () => void;
  teamId: string;
  teamName: string;
  views: SavedViewItem[];
}

/** Team-scoped directory and a routed draft, using the same saved-view query model as workspace Views. */
const TeamViewsSurface = ({
  error,
  isLoading,
  onRetry,
  teamId,
  teamName,
  views,
}: TeamViewsSurfaceProps) => {
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const navigate = useWorkspaceAwareNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { creating, entityType } = readTeamViewsSearch(`?${searchParams}`);
  const [draft, setDraft] = useState(() => newTeamViewDraft(entityType, teamId));
  const [saving, setSaving] = useState(false);
  const [control, setControl] = useState<'filters' | 'display' | null>(null);
  const [sort, setSort] = useState<
    'createdAsc' | 'createdDesc' | 'nameAsc' | 'nameDesc' | 'updatedAsc' | 'updatedDesc'
  >('nameAsc');
  const defaultName = entityType === 'task' ? t('teams.viewAllIssues') : t('teams.viewAllProjects');

  const wasCreating = useRef(false);
  useEffect(() => {
    if (creating && !wasCreating.current) {
      setDraft(newTeamViewDraft(entityType, teamId));
    } else if (creating) {
      // The URL is the entity source of truth: Back/forward can flip `?entity`
      // while `?new=1` stays set — mirror it into the draft (keeping the typed
      // name, resetting builder state exactly like selectEntity does).
      setDraft((current) =>
        current.entityType === entityType
          ? current
          : {
              ...current,
              builder: { any: [], rows: [], slots: [] },
              entityType,
              groupBy: entityType === 'task' ? 'status' : 'none',
            },
      );
    }
    wasCreating.current = creating;
  }, [creating, entityType, teamId]);

  const query = useMemo(() => teamViewDraftQuery(draft, teamId), [draft, teamId]);
  const groupTitle = useWorkQueryGroupTitle({
    cycleTeamIds: query.groupBy === 'cycle' ? [teamId] : [],
    needsAssignee: query.groupBy === 'assignee' || query.subGroupBy === 'assignee',
    needsProject: query.groupBy === 'project' || query.subGroupBy === 'project',
  });
  const {
    data: preview,
    error: previewError,
    isLoading: previewLoading,
    mutate: retryPreview,
  } = useClientDataSWR(
    creating && workspaceId ? ['team-view-preview', workspaceId, query] : null,
    () => workAttentionService.query({ query }),
  );
  const result = preview?.data;
  const tasks = result && 'tasks' in result ? (result.tasks ?? []) : [];
  const groups = result && 'groups' in result ? (result.groups ?? []) : [];
  const projects = result && 'projects' in result ? (result.projects ?? []) : [];
  const filteredViews = filterSavedViewsByEntity(views, entityType, '', (view) => view.name);
  const sortedViews = [...filteredViews].sort((a, b) => {
    const direction = sort.endsWith('Desc') ? -1 : 1;
    if (sort === 'nameAsc' || sort === 'nameDesc') return direction * a.name.localeCompare(b.name);
    const field = sort.startsWith('created') ? 'createdAt' : 'updatedAt';
    const left = new Date(a[field] ?? 0).getTime();
    const right = new Date(b[field] ?? 0).getTime();
    return direction * (left - right);
  });

  const changeLocation = (patch: Parameters<typeof nextTeamViewsSearch>[1]) => {
    setControl(null);
    setSearchParams(nextTeamViewsSearch(`?${searchParams}`, patch));
  };
  const selectEntity = (next: WorkQueryEntityType) => {
    if (creating)
      setDraft((current) => ({
        ...current,
        builder: { any: [], rows: [], slots: [] },
        entityType: next,
        groupBy: next === 'task' ? 'status' : 'none',
      }));
    changeLocation({ entityType: next });
  };
  const cancel = () => {
    setDraft(newTeamViewDraft(entityType, teamId));
    changeLocation({ creating: false });
  };
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const created = await workAttentionService.savedViewCreate({
        entityType: draft.entityType,
        layout: draft.layout,
        name: draft.name.trim() || defaultName,
        query,
        teamId,
        visibility: 'team',
      });
      await mutate(workAttentionKeys.savedViews(workspaceId));
      navigate(`/views/${created.data.id}`);
    } catch (error) {
      console.error('Failed to save team view', error);
      toast.error(t('savedViews.saveAsFailed'));
    } finally {
      setSaving(false);
    }
  };

  const entityTabs = (
    <Tabs
      value={entityType}
      onValueChange={(kind) => {
        if (kind === 'task' || kind === 'project') selectEntity(kind);
      }}
    >
      <TabsList>
        {(['task', 'project'] as const).map((kind) => (
          <TabsTrigger key={kind} value={kind}>
            {t(kind === 'task' ? 'savedViews.tabIssues' : 'savedViews.entityProject')}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );

  const sortOptions = [
    { label: t('savedViews.sort.nameAsc'), value: 'nameAsc' },
    { label: t('savedViews.sort.nameDesc'), value: 'nameDesc' },
    { label: t('savedViews.sort.createdDesc'), value: 'createdDesc' },
    { label: t('savedViews.sort.createdAsc'), value: 'createdAsc' },
    { label: t('savedViews.sort.updatedDesc'), value: 'updatedDesc' },
    { label: t('savedViews.sort.updatedAsc'), value: 'updatedAsc' },
  ];

  const displayControl = (
    <Popover
      open={control === 'display'}
      onOpenChange={(open) => setControl(open ? 'display' : null)}
    >
      <PopoverTrigger
        render={
          <Button
            aria-label={t('savedViews.displayOptions')}
            size="icon"
            title={t('savedViews.displayOptions')}
            variant="ghost"
          >
            <Settings2Icon aria-hidden className="size-4" />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-auto max-w-[calc(100vw-2rem)]">
        {creating ? (
          <div className={cn('flex flex-col', styles.popover)}>
            <ViewDefinitionEditor showFilters={false} value={draft} onChange={setDraft} />
          </div>
        ) : (
          <div className={cn('flex flex-col', styles.popover)} style={{ gap: 10 }}>
            <span className="text-sm">{t('savedViews.sortDefault')}</span>
            <Select
              items={sortOptions}
              value={sort}
              onValueChange={(value) => {
                if (
                  value === 'nameAsc' ||
                  value === 'nameDesc' ||
                  value === 'createdAsc' ||
                  value === 'createdDesc' ||
                  value === 'updatedAsc' ||
                  value === 'updatedDesc'
                )
                  setSort(value);
              }}
            >
              <SelectTrigger aria-label={t('savedViews.sortDefault')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );

  if (creating)
    return (
      <WorkSurface>
        <NavHeader
          left={
            <span className="text-sm font-medium">
              {teamName} › {draft.name || defaultName}
            </span>
          }
        />
        <div className={cn('flex flex-col', styles.editorHeader)} style={{ gap: 14 }}>
          <div className="flex flex-row items-center gap-3 flex-wrap">
            <Input
              aria-label={t('savedViews.name')}
              className="flex-1"
              placeholder={defaultName}
              style={{ minWidth: 180 }}
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
            <span className="text-sm text-muted-foreground">
              {t('teams.viewSaveTo')} {teamName}
            </span>
            <Button variant="outline" onClick={cancel}>
              {t('cancel')}
            </Button>
            <Button aria-busy={saving} disabled={saving} onClick={() => void save()}>
              {saving ? <LoaderCircleIcon className="animate-spin" /> : null}
              {t('savedViews.createView')}
            </Button>
          </div>
          <Input disabled placeholder={t('teams.viewDescription')} />
        </div>
        <WorkSurfaceToolbar>
          {entityTabs}
          <div className="flex flex-row items-center" style={{ gap: 6, marginInlineStart: 'auto' }}>
            <Popover
              open={control === 'filters'}
              onOpenChange={(open) => setControl(open ? 'filters' : null)}
            >
              <PopoverTrigger
                render={
                  <Button
                    aria-label={t('savedViews.filters.add')}
                    size="icon"
                    title={t('savedViews.filters.add')}
                    variant="ghost"
                  >
                    <FilterIcon aria-hidden className="size-4" />
                  </Button>
                }
              />
              <PopoverContent align="end" className="w-auto max-w-[calc(100vw-2rem)]">
                <div className={cn('flex flex-col', styles.popover)}>
                  <ViewDefinitionEditor showDisplay={false} value={draft} onChange={setDraft} />
                </div>
              </PopoverContent>
            </Popover>
            {displayControl}
          </div>
        </WorkSurfaceToolbar>
        <div className={styles.resultScroll}>
          {previewError ? (
            <AsyncError error={previewError} onRetry={() => void retryPreview()} />
          ) : draft.entityType === 'project' ? (
            previewLoading ? (
              <span className="text-sm">{t('savedViews.loading')}</span>
            ) : projects.length ? (
              projects.map((project) => <SavedViewProjectRow key={project.id} project={project} />)
            ) : (
              <div className="flex flex-col items-center justify-center p-12">
                <div className="flex flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                  <p>{t('savedViews.emptyResults')}</p>
                </div>
              </div>
            )
          ) : (
            <WorkQueryResults
              emptyLabel={t('savedViews.emptyResults')}
              groupBy={result && 'groupBy' in result ? result.groupBy : undefined}
              groupTitle={groupTitle}
              groups={groups}
              layout={draft.layout}
              loadMoreLabel={t('savedViews.loadMore')}
              loading={previewLoading}
              loadingLabel={t('savedViews.loading')}
              subGroupBy={query.subGroupBy}
              tasks={tasks}
              total={result?.total}
            />
          )}
        </div>
      </WorkSurface>
    );

  return (
    <WorkSurface>
      <NavHeader
        left={<span className="text-sm font-medium">{t('tab.views')}</span>}
        right={
          <div className="flex flex-row items-center gap-2">
            <WorkFavoriteButton targetId={teamId} targetType="team" />
            <Button variant="outline" onClick={() => changeLocation({ creating: true })}>
              <PlusIcon aria-hidden className="size-4" />
              {t('savedViews.newView')}
            </Button>
          </div>
        }
      />
      <WorkSurfaceToolbar>
        {entityTabs}
        <div className="flex flex-col" style={{ marginInlineStart: 'auto' }}>
          {displayControl}
        </div>
      </WorkSurfaceToolbar>
      <WorkSurfaceCollection className={styles.directoryBody}>
        {error && sortedViews.length === 0 ? (
          <AsyncError error={error} onRetry={onRetry} />
        ) : isLoading && sortedViews.length === 0 ? (
          <div aria-busy aria-label={t('savedViews.loading')} className="flex flex-col gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton className="h-10 w-full" key={index} />
            ))}
          </div>
        ) : sortedViews.length ? (
          <div className="flex flex-col gap-0">
            {error ? <AsyncError error={error} variant="inline" onRetry={onRetry} /> : null}
            {sortedViews.map((view) => (
              <WorkspaceLink className={styles.viewRow} key={view.id} to={`/views/${view.id}`}>
                <Layers2Icon aria-hidden className="size-4 shrink-0" />
                <span className={cn('flex-1', 'text-sm')}>{view.name}</span>
                <span className="text-sm text-muted-foreground">
                  {t(savedViewVisibilityKey(view.visibility))}
                </span>
              </WorkspaceLink>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            {
              <Layers2Icon
                aria-hidden
                className="size-4 shrink-0"
                style={{ width: 64, height: 64 }}
              />
            }
            <span className="text-sm font-semibold" style={{ fontSize: 20 }}>
              {t('tab.views')}
            </span>
            <span className="text-sm text-muted-foreground">
              {t(
                entityType === 'task'
                  ? 'teams.viewDirectoryDescriptionIssues'
                  : 'teams.viewDirectoryDescriptionProjects',
              )}
            </span>
            <div className="flex flex-row justify-center gap-2 flex-wrap">
              <Button onClick={() => changeLocation({ creating: true })}>
                {t('teams.viewCreateNew')}
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  window.open('/docs/usage/getting-started/work', '_blank', 'noopener,noreferrer')
                }
              >
                {t('teams.viewDocumentation')}
              </Button>
            </div>
          </div>
        )}
      </WorkSurfaceCollection>
    </WorkSurface>
  );
};

export default TeamViewsSurface;
