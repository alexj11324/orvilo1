import type { TaskWorkflowCategory } from '@orvilo/types';
import { cn } from 'cn';
import { CheckIcon, Flag, Link2, LinkIcon, MoreHorizontal, Plus, Search } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';
import { useAppOrigin } from '@/hooks/useAppOrigin';
import { usePermission } from '@/hooks/usePermission';
import { workAttentionService } from '@/services/workAttention';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';
import { copyToClipboard } from '@/utils/clipboard';
import { isTrpcErrorCode, trpcErrorMessage } from '@/utils/trpcError';

import TaskStatusIcon from '../features/TaskStatusIcon';
import { taskDetailPath } from '../shared/taskDetailPath';
import {
  dependentIdentifier,
  type RelationCandidate,
  relationPickerRows,
  relationRejectionKey,
  toggleRelationCandidate,
  writeRelationsOneByOne,
} from './issueRelationPicker';
import PropertyGroup from './PropertyGroup';
import { RAIL_PLACEHOLDER_CLASS } from './railControl';
import { RAIL_VALUE_FONT_SIZE } from './railText';
import {
  collapseRelationRows,
  isOpenBlocker,
  ISSUE_RELATION_KINDS,
  type IssueRelationKind,
  relationKindOf,
} from './relationGroups';
import { taskDetailLayoutStyles as styles } from './taskDetailLayoutStyles';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';

const TASK_STATUS_SET = new Set([
  'backlog',
  'canceled',
  'completed',
  'failed',
  'paused',
  'running',
  'scheduled',
]);

type TaskStatus = 'backlog' | 'canceled' | 'completed' | 'failed' | 'paused' | 'running';

const toTaskStatus = (status?: string | null): TaskStatus =>
  status && TASK_STATUS_SET.has(status) ? (status as TaskStatus) : 'backlog';

/** Linear's field marks: a warning-toned flag for "Blocked by", a red one for "Blocks". */
const RELATION_MARKS = {
  blockedBy: { Icon: Flag, className: 'text-warning' },
  blocking: { Icon: Flag, className: 'text-destructive' },
  relates: { Icon: Link2, className: 'text-muted-foreground' },
} as const;

interface RelationEdge {
  dependsOn: string;
  direction?: 'blockedBy' | 'blocking';
  id?: string;
  name?: string | null;
  relationId?: string;
  status?: string | null;
  type: string;
  workflowCategory?: TaskWorkflowCategory;
  workflowStateId?: string | null;
}

type SearchHit = RelationCandidate;

const useRelationEdges = () => {
  const detail = useTaskDetailSelector(taskDetailSelectors.taskDetail);
  return useMemo(() => {
    const edges = (detail?.dependencies ?? []) as RelationEdge[];
    const grouped: Record<IssueRelationKind, RelationEdge[]> = {
      blockedBy: [],
      blocking: [],
      relates: [],
    };
    for (const edge of edges) {
      const kind = relationKindOf(edge);
      if (kind) grouped[kind].push(edge);
    }
    return { edges, grouped };
  }, [detail?.dependencies]);
};

/** The run-gating line Linear keeps as a banner on the issue body. */
export const TaskBlockedNotice = () => {
  const { t } = useTranslation('chat');
  const { edges, grouped } = useRelationEdges();
  const openBlockers = edges.filter((edge) => isOpenBlocker(edge));
  const statusKey =
    openBlockers.length > 0 ? 'blocked' : grouped.blockedBy.length > 0 ? 'ready' : null;
  if (!statusKey) return null;
  return (
    <div
      role="status"
      className={cn(
        'rounded-(--radius-card) px-3 py-1.5 text-xs',
        statusKey === 'blocked'
          ? 'bg-destructive/10 text-destructive'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {t(`taskDetail.prerequisites.${statusKey}`)}
    </div>
  );
};

/**
 * The Related group's rows and search, shared by the rail and the "Display
 * properties" dialog. `showAllKinds` lists every kind's header, set or not —
 * the dialog is a setup surface, the rail only shows kinds that have rows.
 */
export const TaskRelationFields = ({
  showAllKinds = false,
  taskId,
}: {
  showAllKinds?: boolean;
  taskId: string;
}) => {
  const { t } = useTranslation('chat');
  const navigate = useWorkspaceAwareNavigate();
  const appOrigin = useAppOrigin();
  const workspaceSlug = useActiveWorkspaceSlug();
  const { allowed, reason } = usePermission('create_content');
  const removeDependency = useTaskStore((s) => s.removeDependency);
  const removeIssueRelation = useTaskStore((s) => s.removeIssueRelation);
  const addDependency = useTaskStore((s) => s.addDependency);
  const refreshTaskDetail = useTaskStore((s) => s.internal_refreshTaskDetail);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [picker, setPicker] = useState<IssueRelationKind | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [selected, setSelected] = useState<SearchHit[]>([]);
  // Rows past Linear's "Show N more" fold stay collapsed until asked for.
  const [expanded, setExpanded] = useState(false);
  const [searching, setSearching] = useState(false);
  // A "mark as" pick hands focus to the search input it opens; the menu must
  // not pull focus back to its own trigger (same escape hatch as
  // TaskProperties' "+ Add property" menu).
  const pickerFromMenu = useRef(false);
  const { edges, grouped } = useRelationEdges();
  const { hiddenCount, visible } = collapseRelationRows(grouped, expanded);
  const linkedKey = edges.map((edge) => edge.dependsOn).join('\n');

  const removalTotals = new Map<string, number>();
  for (const edge of edges) {
    const key = `${edge.type}:${edge.direction ?? ''}:${edge.dependsOn}`;
    removalTotals.set(key, (removalTotals.get(key) ?? 0) + 1);
  }
  const removalSeen = new Map<string, number>();
  const removalLabel = (edge: RelationEdge) => {
    const key = `${edge.type}:${edge.direction ?? ''}:${edge.dependsOn}`;
    if (removalTotals.get(key) === 1) return edge.dependsOn;
    const position = (removalSeen.get(key) ?? 0) + 1;
    removalSeen.set(key, position);
    return t('taskDetail.prerequisites.relationPosition', {
      identifier: edge.dependsOn,
      position,
    });
  };
  const removalLabels = edges.map((edge) => removalLabel(edge));

  useEffect(() => {
    if (!picker) return;
    const needle = query.trim();
    const linked = new Set(linkedKey ? linkedKey.split('\n') : []);
    if (!needle) {
      setHits([]);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const timer = setTimeout(() => {
      void workAttentionService
        .search({
          // Relations stay inside one project; the server only returns those.
          eligibleFor: { relation: 'dependency', taskId },
          limitPerType: 8,
          query: needle,
          type: 'task',
        })
        .then((response) => {
          if (!active) return;
          const next = (response.data ?? [])
            .filter((item) => item.type === 'task')
            .map((item) => ({
              id: item.id,
              identifier: item.description?.trim() || item.id,
              title: item.title,
            }))
            .filter((item) => item.identifier !== taskId && !linked.has(item.identifier));
          setHits(next);
        })
        .catch(() => {
          if (active) setHits([]);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [linkedKey, picker, query, taskId]);

  /**
   * The server's stated reason when it gives one (cycle, another project, an
   * unfinished prerequisite on a running Issue…), else its own message, else
   * the generic line. `dependent` is the Issue that would gain a prerequisite.
   */
  const describeFailure = (err: unknown, dependent: string) => {
    const reasonKey = relationRejectionKey(err, 'dependency');
    if (reasonKey) return t(reasonKey, { identifier: dependent });
    if (isTrpcErrorCode(err, 'NOT_FOUND')) return t('taskDetail.prerequisites.unavailable');
    return trpcErrorMessage(err) ?? t('taskDetail.prerequisites.error');
  };

  const change = async (operation: () => Promise<void>) => {
    if (!allowed || pending) return;
    setPending(true);
    setErrors([]);
    try {
      await operation();
    } catch (err) {
      setErrors([describeFailure(err, taskId)]);
    } finally {
      setPending(false);
    }
  };

  const closePicker = () => {
    setPicker(null);
    setQuery('');
    setHits([]);
    setSelected([]);
  };

  /** Write every picked Issue; keep the ones that were refused, each with its reason. */
  const addSelected = () => {
    const kind = picker;
    if (!kind || selected.length === 0) return;
    void change(async () => {
      const { added, failed } = await writeRelationsOneByOne(selected, (hit) =>
        kind === 'blocking'
          ? addDependency(hit.identifier, taskId, 'blocks')
          : addDependency(taskId, hit.identifier, kind === 'relates' ? 'relates' : 'blocks'),
      );
      // A "blocking" edge is stored on the other Issue, so this one is refetched by hand.
      if (kind === 'blocking' && added.length > 0) await refreshTaskDetail(taskId);
      // The change the user just made should be visible — a new edge in a
      // folded kind must not stay behind "Show N more".
      if (added.length > 0) setExpanded(true);
      if (failed.length === 0) {
        closePicker();
        return;
      }
      setSelected(failed.map((item) => item.candidate));
      setErrors(
        failed.map((item) =>
          t('taskDetail.picker.notAdded', {
            identifier: item.candidate.identifier,
            reason: describeFailure(
              item.error,
              dependentIdentifier(kind === 'blocking', taskId, item.candidate.identifier),
            ),
          }),
        ),
      );
    });
  };

  const copyLink = (edge: RelationEdge) => {
    const path = buildWorkspaceAwarePath(
      taskDetailPath(edge.dependsOn, undefined, edge.name),
      workspaceSlug,
    );
    void copyToClipboard(`${appOrigin}${path}`).then(() => {
      toast.success(t('taskList.contextMenu.copyLinkSuccess'));
    });
  };

  const unlink = (edge: RelationEdge) => {
    void change(() =>
      edge.relationId
        ? removeIssueRelation(taskId, edge.relationId)
        : removeDependency(
            edge.direction === 'blocking' ? edge.dependsOn : taskId,
            edge.direction === 'blocking' ? taskId : edge.id!,
            edge.type === 'relates' ? 'relates' : 'blocks',
          ),
    );
  };

  /** The group menu's "Mark current issue as" pick: opens that kind's search, or closes it again. */
  const togglePicker = (kind: IssueRelationKind) => {
    // Suppress focus restore only when the pick opens a search — its input
    // autofocuses. Toggling the same kind off hands focus back to the menu
    // trigger as usual.
    pickerFromMenu.current = picker !== kind;
    setPicker(picker === kind ? null : kind);
    setQuery('');
    setHits([]);
    setSelected([]);
  };

  return (
    <>
      {ISSUE_RELATION_KINDS.map((kind) => {
        const rows = visible[kind];
        // An empty kind has no header row; the group's add menu still reaches
        // its search. A kind can also sit entirely behind "Show N more".
        if (rows.length === 0 && picker !== kind && !showAllKinds) return null;
        const { Icon, className: markClass } = RELATION_MARKS[kind];
        return (
          <div
            className={cn('flex flex-col gap-0.5', rows.length === 0 ? 'flex-none' : 'w-full')}
            data-relation-kind={kind}
            key={kind}
          >
            <div
              className="flex h-7 items-center gap-2 whitespace-nowrap text-muted-foreground"
              style={{ fontSize: RAIL_VALUE_FONT_SIZE }}
            >
              <Icon aria-hidden className={markClass} size={16} />
              <span className="truncate">{t(`taskDetail.relations.${kind}`)}</span>
            </div>
            {picker === kind && allowed && (
              <div className="overflow-hidden rounded-(--radius-card) border">
                <div className="flex items-center gap-2 border-b px-2">
                  <Search aria-hidden className="text-muted-foreground" size={14} />
                  <Input
                    autoFocus
                    aria-label={t('taskDetail.relations.search')}
                    className="border-0 shadow-none focus-visible:ring-0"
                    placeholder={t('taskDetail.relations.search')}
                    value={query}
                    visualSize="compact"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                {searching && (
                  <div className="px-2 py-2 text-xs text-muted-foreground">
                    {t('taskDetail.relations.searching')}
                  </div>
                )}
                {!searching && query.trim() && hits.length === 0 && (
                  <div className="px-2 py-2 text-xs text-muted-foreground">
                    {t('taskDetail.relations.noMatches')}
                  </div>
                )}
                {relationPickerRows(selected, hits).map((hit) => {
                  const picked = selected.some((item) => item.id === hit.id);
                  return (
                    <Button
                      aria-pressed={picked}
                      className="h-9 w-full justify-start gap-3 rounded-none border-0 px-2 font-normal"
                      disabled={pending}
                      key={hit.id}
                      variant="ghost"
                      onClick={() =>
                        setSelected((current) => toggleRelationCandidate(current, hit))
                      }
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'flex size-4 shrink-0 items-center justify-center rounded-(--radius-chip) border',
                          picked
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border',
                        )}
                      >
                        {picked ? <CheckIcon className="size-3" /> : null}
                      </span>
                      <span
                        className="font-mono text-muted-foreground"
                        style={{ fontSize: RAIL_VALUE_FONT_SIZE }}
                      >
                        {hit.identifier}
                      </span>
                      {hit.title !== hit.identifier && (
                        <span className="truncate" style={{ fontSize: RAIL_VALUE_FONT_SIZE }}>
                          {hit.title}
                        </span>
                      )}
                    </Button>
                  );
                })}
                {selected.length > 0 && (
                  <div className="flex justify-end border-t p-1">
                    <Button disabled={pending} loading={pending} size="sm" onClick={addSelected}>
                      {t('taskDetail.picker.add', { count: selected.length })}
                    </Button>
                  </div>
                )}
              </div>
            )}
            {rows.length === 0
              ? null
              : rows.map((edge) => {
                  const index = edges.indexOf(edge);
                  const unavailable = !edge.status;
                  const workflowVisual =
                    edge.workflowStateId && edge.workflowCategory
                      ? WORKFLOW_CATEGORY_VISUALS[edge.workflowCategory]
                      : undefined;
                  const canUnlink = Boolean(edge.relationId || edge.id);
                  return (
                    <div
                      className="group flex min-h-8 items-center gap-1 hover:bg-accent"
                      key={edge.relationId ?? `${kind}:${edge.dependsOn}:${index}`}
                      // On the row, not the button: a disabled button swallows
                      // the pointer, and an unavailable issue still needs its id.
                      title={edge.name ?? edge.dependsOn}
                    >
                      <Button
                        className="min-w-0 flex-1 justify-start gap-2 border-0 px-1 font-normal"
                        disabled={unavailable}
                        size="compact"
                        variant="ghost"
                        onClick={() =>
                          navigate(taskDetailPath(edge.dependsOn, undefined, edge.name))
                        }
                      >
                        {workflowVisual ? (
                          <workflowVisual.icon color={workflowVisual.color} size={16} />
                        ) : (
                          <TaskStatusIcon size={16} status={toTaskStatus(edge.status)} />
                        )}
                        <span
                          className="shrink-0 font-mono text-muted-foreground"
                          style={{ fontSize: RAIL_VALUE_FONT_SIZE }}
                        >
                          {edge.dependsOn}
                        </span>
                        {edge.name ? (
                          <span
                            className="min-w-0 flex-1 truncate"
                            style={{ fontSize: RAIL_VALUE_FONT_SIZE }}
                          >
                            {edge.name}
                          </span>
                        ) : (
                          <span className="flex-1" />
                        )}
                        {unavailable ? (
                          <span
                            className="truncate text-muted-foreground"
                            style={{ fontSize: RAIL_VALUE_FONT_SIZE }}
                          >
                            {t('taskDetail.prerequisites.unavailable')}
                          </span>
                        ) : null}
                      </Button>
                      {allowed && (canUnlink || !unavailable) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                aria-label={t('taskDetail.relations.actions')}
                                size="icon-sm"
                                variant="ghost"
                              >
                                <MoreHorizontal />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              {!unavailable && (
                                <DropdownMenuItem onClick={() => copyLink(edge)}>
                                  <LinkIcon />
                                  {t('taskList.contextMenu.copyLink')}
                                </DropdownMenuItem>
                              )}
                              {canUnlink && (
                                <DropdownMenuItem
                                  variant="destructive"
                                  aria-label={t('taskDetail.prerequisites.removeBlocker', {
                                    identifier: removalLabels[index],
                                  })}
                                  onClick={() => unlink(edge)}
                                >
                                  {t('taskDetail.relations.remove')}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  );
                })}
          </div>
        );
      })}
      {hiddenCount > 0 && (
        <Button
          className={cn(styles.addProperty, RAIL_PLACEHOLDER_CLASS)}
          size="sm"
          variant="ghost"
          onClick={() => setExpanded(true)}
        >
          {t('taskDetail.relations.showMore', { count: hiddenCount })}
        </Button>
      )}
      {allowed && (
        <DropdownMenu
          onOpenChange={(open) => {
            if (open) pickerFromMenu.current = false;
          }}
        >
          <DropdownMenuTrigger
            render={
              <Button className={styles.addProperty} size="sm" variant="ghost">
                <Plus data-icon="inline-start" />
                {t('taskDetail.relations.add')}
              </Button>
            }
          />
          <DropdownMenuContent align="start" finalFocus={() => !pickerFromMenu.current}>
            <DropdownMenuGroup>
              {/* Linear's "Mark current issue as" picks, in the header menu's
                  order: each opens that kind's inline search under its header.
                  Duplicate stays in the main column's TaskDuplicateRelation. */}
              <DropdownMenuItem onClick={() => togglePicker('relates')}>
                {t('taskDetail.menu.mark.relatedTo')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => togglePicker('blockedBy')}>
                {t('taskDetail.menu.mark.blockedBy')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => togglePicker('blocking')}>
                {t('taskDetail.menu.mark.blocking')}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {!allowed && reason && <div className="px-2 text-xs text-muted-foreground">{reason}</div>}
      {errors.length > 0 && (
        <div className="flex flex-col gap-1 px-2 text-xs text-destructive" role="alert">
          {errors.map((message) => (
            <span key={message}>{message}</span>
          ))}
        </div>
      )}
    </>
  );
};

/**
 * The rail's "Related" group — Linear lists every issue this one is linked to
 * as labelled kind groups (Blocked by → Blocks → Related) of status-dot +
 * identifier + title rows that navigate on click, folding long lists behind
 * "Show N more". The group's one add affordance mirrors Linear's "Mark
 * current issue as" menu.
 */
const TaskRelatedSection = memo(() => {
  const { t } = useTranslation('chat');
  const taskId = useTaskDetailTaskId();
  if (!taskId) return null;
  return (
    <PropertyGroup label={t('taskDetail.relations.relates')}>
      <div className={styles.properties}>
        {/* Remount per Issue: picker state and the expanded fold belong to
            the Issue they were opened on. */}
        <TaskRelationFields key={taskId} taskId={taskId} />
      </div>
    </PropertyGroup>
  );
});

TaskRelatedSection.displayName = 'TaskRelatedSection';

export default TaskRelatedSection;
