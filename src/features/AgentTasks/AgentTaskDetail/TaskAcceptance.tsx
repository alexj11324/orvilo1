'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import {
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ExternalLink,
  RotateCcw,
  Trash,
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import {
  type AcceptanceCheck,
  checkDisplayTitle,
  checkHeadMeta,
  CriterionList,
  CriterionRow,
  groupChecks,
  shouldGroupChecks,
  useAcceptanceBundle,
  useAcceptanceBySubject,
} from '@/features/Acceptance';
import { openAcceptanceDeleteConfirm } from '@/features/Acceptance/AcceptanceDeleteConfirm';
import {
  AcceptanceBundleGate,
  AcceptanceScope,
} from '@/features/Acceptance/Viewer/AcceptanceScope';
import AcceptanceCheckInventory from '@/features/Acceptance/Viewer/Checks/AcceptanceCheckInventory';
import AcceptanceDecision from '@/features/Acceptance/Viewer/Review/AcceptanceDecision';
import { usePermission } from '@/hooks/usePermission';
import { verifyService } from '@/services/verify';
import { useChatStore } from '@/store/chat';
import { useGlobalStore } from '@/store/global';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import GoalRoundTimeline from './GoalRoundTimeline';
import { resolveTaskAcceptanceRequirement } from './resolveTaskAcceptanceProjection';
import { TaskAcceptanceHeader } from './TaskAcceptanceHeader';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';
import TaskVerifyConfig from './TaskVerifyConfig';

const styles = createStaticStyles(({ css }) => ({
  body: css`
    padding-inline: 12px;
  `,
  error: css`
    padding-block: 10px;
    padding-inline: 12px;
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorErrorBg};
  `,
  group: css`
    & + & {
      border-block-start: 1px solid ${cssVar.colorBorderSecondary};
    }
  `,
  groupHeader: css`
    cursor: pointer;
    padding-block: 9px;
    padding-inline: 12px;
  `,
}));

interface AcceptanceErrorProps {
  onRetry: () => void;
}

const AcceptanceError = memo<AcceptanceErrorProps>(({ onRetry }) => {
  const { t } = useTranslation('chat');

  return (
    <div className={`flex items-center gap-2 ${styles.error}`}>
      <div className="text-[12px] text-destructive" style={{ flex: 1 }}>
        {t('taskDetail.acceptance.loadError')}
      </div>
      <Button size="sm" variant="ghost" onClick={onRetry}>
        {<RotateCcw />}
        {t('taskDetail.acceptance.retry')}
      </Button>
    </div>
  );
});

AcceptanceError.displayName = 'TaskAcceptanceError';

interface CompactCheckRowProps {
  check: AcceptanceCheck;
  onOpen: () => void;
}

const CompactCheckRow = memo<CompactCheckRowProps>(({ check, onOpen }) => {
  const { t } = useTranslation('verify');
  const meta = checkHeadMeta(check);

  return (
    <CriterionRow
      data-task-acceptance-check={check.id}
      icon={<meta.icon color={meta.color} size={16} style={{ flex: 'none' }} />}
      seq={check.seq}
      title={checkDisplayTitle(check.title, t('acceptance.checks.holisticTitle'))}
      onOpen={onOpen}
    />
  );
});

CompactCheckRow.displayName = 'TaskAcceptanceCompactCheckRow';

interface TaskAcceptanceProps {
  /**
   * `result` — the task result panel. The reader there has just read the
   * delivery and wants to judge it on the spot, so this mounts the real
   * Acceptance checklist and decision bar (the same atoms the acceptance page
   * assembles) instead of a compact preview that only links out. The round
   * timeline and the 验收目标 contract stay behind the report link.
   */
  variant?: 'default' | 'result';
}

const TaskAcceptance = memo<TaskAcceptanceProps>(({ variant = 'default' }) => {
  const { t } = useTranslation(['chat', 'verify']);
  const openAcceptance = useChatStore((state) => state.openAcceptance);
  const openAcceptanceCheck = useChatStore((state) => state.openAcceptanceCheck);
  const showTaskAgentPanel = useGlobalStore((state) => state.toggleTaskAgentPanel);
  const { allowed: canEditTask } = usePermission('create_content');
  const taskId = useTaskDetailTaskId();
  const taskDatabaseId = useTaskDetailSelector(taskDetailSelectors.taskDatabaseId);
  const taskName = useTaskDetailSelector(taskDetailSelectors.taskName);
  const automationMode = useTaskDetailSelector(taskDetailSelectors.taskAutomationMode);
  const verify = useTaskDetailSelector(taskDetailSelectors.taskVerifyConfig);
  const [sectionExpanded, setSectionExpanded] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [requirementExpanded, setRequirementExpanded] = useState(false);

  const {
    data: acceptanceSubject,
    error: subjectError,
    isLoading: subjectLoading,
    mutate: mutateSubject,
  } = useAcceptanceBySubject('task', automationMode ? null : (taskDatabaseId ?? null));
  const {
    data: bundle,
    error: bundleError,
    isLoading: bundleLoading,
    mutate: mutateBundle,
  } = useAcceptanceBundle(acceptanceSubject?.id ?? null);

  // Task detail intentionally renders the Acceptance's cross-round union. The
  // count may grow when later rounds introduce checks; that history is part of
  // the delivery record rather than a mismatch with the original configuration.
  const checks = useMemo(() => bundle?.checks ?? [], [bundle?.checks]);
  const requirement = resolveTaskAcceptanceRequirement(
    verify?.requirement,
    bundle?.acceptance.requirement,
  );
  const openCheck = (acceptanceId: string, checkId: string) => {
    showTaskAgentPanel(true);
    openAcceptanceCheck(acceptanceId, checkId);
  };

  // Same destination as a check, one level up: the report belongs in the panel
  // beside the task, not on a page that replaces it.
  const openReport = (acceptanceId: string) => {
    showTaskAgentPanel(true);
    openAcceptance(acceptanceId);
  };

  const grouped = shouldGroupChecks(checks.length);
  const groups = useMemo(
    () =>
      grouped ? groupChecks(checks, t('acceptance.group.uncategorized', { ns: 'verify' })) : [],
    [checks, grouped, t],
  );
  const groupKeys = groups.map((group) => group.key);
  const allGroupsCollapsed =
    groupKeys.length > 0 && groupKeys.every((key) => collapsedGroups.has(key));
  // A recurring task (schedule / heartbeat) never gets a verify plan on the
  // server — its ticks are not deliveries. Offering the Verifier config or an
  // acceptance section here would advertise a contract that never runs.
  if (automationMode) return null;

  if (subjectLoading) return <NeuralNetworkLoading size={28} />;
  // Before the first Acceptance round exists, the configured criteria ARE the
  // delivery acceptance. Keep them in this single slot; once a round exists,
  // replace the definitions with their live/result projection below.
  if (!acceptanceSubject && !subjectError) return <TaskVerifyConfig />;

  // Removing the acceptance drops the aggregate (round reports detach) AND
  // clears the task's verify config — otherwise the section would fall back to
  // the configured-criteria view and the next run would recreate the aggregate.
  // Ordering makes the two writes safe without a server transaction: the config
  // is cleared FIRST (a failure aborts before anything is destroyed), and only
  // then is the aggregate deleted (a failure there leaves it intact for retry).
  // The inverse order could delete the record while the stale config survives
  // to recreate it on the next run.
  const handleRemoveAcceptance = () => {
    if (!acceptanceSubject || !taskId) return;
    openAcceptanceDeleteConfirm({
      description: t('taskDetail.acceptance.removeConfirm.content'),
      ids: [acceptanceSubject.id],
      title: taskName || requirement || t('taskDetail.acceptance.untitled'),
      onDelete: async (purge) => {
        await useTaskStore.getState().updateVerifyConfig(taskId, {
          enabled: false,
          requirement: null,
          verifyCriteriaIds: null,
        });
        await verifyService.deleteAcceptance(acceptanceSubject.id, purge);
        await mutateSubject();
      },
    });
  };

  // `acceptance.remove` only authorizes the acceptance creator (or a workspace
  // owner, cloud-side), not everyone who can edit the task — so the affordance
  // follows the bundle's isOwner rather than dead-ending in FORBIDDEN.
  const reportButton = acceptanceSubject && (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" onClick={() => openReport(acceptanceSubject.id)}>
        {<ExternalLink />}
        {t('taskDetail.acceptance.openReport')}
      </Button>
      {canEditTask && bundle?.isOwner && (
        <ActionIcon
          icon={Trash}
          size={'small'}
          title={t('taskDetail.acceptance.remove')}
          onClick={handleRemoveAcceptance}
        />
      )}
    </div>
  );

  // The result panel mounts the live checklist itself — rows expand in place,
  // reviews land here, and the decision bar closes the loop without a detour
  // through the acceptance page. Its own 验收检查清单 header replaces the
  // section header; the report link rides in the inventory toolbar.
  if (variant === 'result' && acceptanceSubject && !subjectError) {
    return (
      <AcceptanceScope embedded acceptanceId={acceptanceSubject.id}>
        <AcceptanceBundleGate height={160}>
          <div className="flex flex-col gap-4">
            <AcceptanceCheckInventory toolbar={reportButton} />
            <AcceptanceDecision />
          </div>
        </AcceptanceBundleGate>
      </AcceptanceScope>
    );
  }

  const header = (
    <TaskAcceptanceHeader
      count={checks.length}
      // The section shows the rounds and the checklist; the report is the full
      // record behind them — reachable from the block it belongs to, instead
      // of only from the status row at the top of the page.
      extra={reportButton}
      isOpen={sectionExpanded}
      onToggle={() => setSectionExpanded((expanded) => !expanded)}
    />
  );

  if (subjectError) {
    return (
      <div className="flex flex-col gap-2">
        {header}
        <div className={`flex flex-col ${styles.body}`}>
          <AcceptanceError onRetry={() => void mutateSubject()} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {header}
      <Collapsible open={sectionExpanded}>
        <CollapsibleContent>
          <div className={`flex flex-col gap-3.5 ${styles.body}`}>
            {bundleLoading && <NeuralNetworkLoading size={28} />}
            {bundleError && <AcceptanceError onRetry={() => void mutateBundle()} />}
            {bundle && (
              <>
                <GoalRoundTimeline rounds={bundle.rounds} />
                {requirement && (
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[12px] text-muted-foreground">
                      {t('taskDetail.acceptance.goal')}
                    </div>
                    {/* The contract, not the result. A goal-dispatched task carries
                      a generated paragraph here, and printing it in full pushed
                      the checks — the thing the reader came for — below the
                      fold. Two lines, and the rest on demand. */}
                    <div
                      className={requirementExpanded ? undefined : 'line-clamp-2'}
                      style={{ cursor: 'pointer' }}
                      title={requirement}
                      onClick={() => setRequirementExpanded((open) => !open)}
                    >
                      {requirement}
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-[7px]">
                  <div className="flex items-center gap-2">
                    <div className="text-[12px] text-muted-foreground">
                      {t('taskDetail.acceptance.checklist')}
                    </div>
                    <div className="flex-1" />
                    {grouped && groupKeys.length > 0 && (
                      <ActionIcon
                        icon={allGroupsCollapsed ? ChevronsUpDown : ChevronsDownUp}
                        size={'small'}
                        title={
                          allGroupsCollapsed
                            ? t('taskDetail.acceptance.expandAll')
                            : t('taskDetail.acceptance.collapseAll')
                        }
                        onClick={() =>
                          setCollapsedGroups(allGroupsCollapsed ? new Set() : new Set(groupKeys))
                        }
                      />
                    )}
                  </div>
                  <CriterionList>
                    {grouped
                      ? groups.map((group) => {
                          const collapsed = collapsedGroups.has(group.key);

                          return (
                            <div className={`flex flex-col ${styles.group}`} key={group.key}>
                              <div
                                className={`flex items-center gap-2 ${styles.groupHeader}`}
                                onClick={() =>
                                  setCollapsedGroups((previous) => {
                                    const next = new Set(previous);
                                    if (next.has(group.key)) next.delete(group.key);
                                    else next.add(group.key);
                                    return next;
                                  })
                                }
                              >
                                <div className="text-[12px]">{group.label}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  {group.checks.length}
                                </div>
                                <div className="flex-1" />
                                <ChevronRight
                                  size={13}
                                  style={{
                                    color: cssVar.colorTextDescription,
                                    transform: collapsed ? 'none' : 'rotate(90deg)',
                                    transition: 'transform 0.2s',
                                  }}
                                />
                              </div>
                              {!collapsed &&
                                group.checks.map((check) => (
                                  <CompactCheckRow
                                    check={check}
                                    key={check.id}
                                    onOpen={() => openCheck(bundle.acceptance.id, check.id)}
                                  />
                                ))}
                            </div>
                          );
                        })
                      : checks.map((check) => (
                          <CompactCheckRow
                            check={check}
                            key={check.id}
                            onOpen={() => openCheck(bundle.acceptance.id, check.id)}
                          />
                        ))}
                  </CriterionList>
                </div>
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
});

TaskAcceptance.displayName = 'TaskAcceptance';

export default TaskAcceptance;
