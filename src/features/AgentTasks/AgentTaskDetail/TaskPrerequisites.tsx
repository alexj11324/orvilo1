import type { TaskWorkflowCategory } from '@orvilo/types';
import { Flag, Link2, LinkIcon, MoreHorizontal, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
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

import TaskStatusIcon from '../features/TaskStatusIcon';
import { taskDetailPath } from '../shared/taskDetailPath';
import { RAIL_VALUE_FONT_SIZE } from './railText';
import {
  isOpenBlocker,
  ISSUE_RELATION_KINDS,
  type IssueRelationKind,
  relationKindOf,
} from './relationGroups';
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

/** Linear's field marks: an orange flag for "Blocked by", a red one for "Blocks". */
const RELATION_MARKS = {
  blockedBy: { Icon: Flag, className: 'text-amber-500' },
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

interface SearchHit {
  id: string;
  identifier: string;
  title: string;
}

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
      className={`rounded-md px-3 py-1.5 text-xs ${
        statusKey === 'blocked'
          ? 'bg-destructive/10 text-destructive'
          : 'bg-muted text-muted-foreground'
      }`}
    >
      {t(`taskDetail.prerequisites.${statusKey}`)}
    </div>
  );
};

const TaskRelationFields = ({ taskId }: { taskId: string }) => {
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
  const [error, setError] = useState<string>();
  const [picker, setPicker] = useState<IssueRelationKind | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const { edges, grouped } = useRelationEdges();
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
        .search({ limitPerType: 8, query: needle, type: 'task' })
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

  const change = async (operation: () => Promise<void>) => {
    if (!allowed || pending) return;
    setPending(true);
    setError(undefined);
    try {
      await operation();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      const key = /not found|unavailable/i.test(message) ? 'unavailable' : 'error';
      setError(t(`taskDetail.prerequisites.${key}`));
    } finally {
      setPending(false);
    }
  };

  const addRelation = (hit: SearchHit) => {
    if (!picker) return;
    void change(async () => {
      if (picker === 'blocking') {
        await addDependency(hit.identifier, taskId, 'blocks');
        await refreshTaskDetail(taskId);
      } else {
        await addDependency(taskId, hit.identifier, picker === 'relates' ? 'relates' : 'blocks');
      }
      setPicker(null);
      setQuery('');
      setHits([]);
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

  return (
    <>
      {ISSUE_RELATION_KINDS.map((kind) => {
        const rows = grouped[kind];
        const { Icon, className: markClass } = RELATION_MARKS[kind];
        return (
          <div className="flex flex-col gap-0.5" data-relation-kind={kind} key={kind}>
            <div className="flex min-h-7 items-center gap-2 text-sm text-muted-foreground">
              <span className="flex size-4 items-center justify-center">
                <Icon className={markClass} size={16} />
              </span>
              <span className="truncate">{t(`taskDetail.relations.${kind}`)}</span>
              <span className="flex-1" />
              {allowed && (
                <Button
                  aria-label={t('taskDetail.relations.add')}
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => {
                    setPicker(picker === kind ? null : kind);
                    setQuery('');
                    setHits([]);
                  }}
                >
                  <Plus />
                </Button>
              )}
            </div>
            {picker === kind && allowed && (
              <div className="overflow-hidden rounded-md border">
                <div className="flex items-center gap-2 border-b px-2">
                  <Search className="text-muted-foreground" size={14} />
                  <Input
                    aria-label={t('taskDetail.relations.search')}
                    className="border-0 shadow-none focus-visible:ring-0"
                    placeholder={t('taskDetail.relations.search')}
                    value={query}
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
                {hits.map((hit) => (
                  <button
                    className="flex h-9 w-full items-center gap-3 px-2 text-left hover:bg-muted"
                    disabled={pending}
                    key={hit.id}
                    type="button"
                    onClick={() => addRelation(hit)}
                  >
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
                  </button>
                ))}
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
                      className="group flex min-h-8 items-center gap-1 hover:bg-muted/70"
                      key={edge.relationId ?? `${kind}:${edge.dependsOn}:${index}`}
                    >
                      <button
                        className="flex min-w-0 flex-1 items-center gap-2 px-1 text-left disabled:cursor-default"
                        disabled={unavailable}
                        title={edge.name ?? edge.dependsOn}
                        type="button"
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
                      </button>
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
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  );
                })}
          </div>
        );
      })}
      {!allowed && reason && (
        <div className="text-xs text-muted-foreground" style={{ paddingInline: 8 }}>
          {reason}
        </div>
      )}
      {error && (
        <div className="text-xs text-destructive" role="alert" style={{ paddingInline: 8 }}>
          {error}
        </div>
      )}
    </>
  );
};

const TaskPrerequisites = () => {
  const taskId = useTaskDetailTaskId();
  return taskId ? <TaskRelationFields key={taskId} taskId={taskId} /> : null;
};

export default TaskPrerequisites;
