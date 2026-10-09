import type { GoalSpend } from '@orvilo/types';
import { formatAbsoluteDateTime } from '@orvilo/utils/time';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import dayjs from 'dayjs';
import { memo, type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import InputNumber from '@/components/InputNumber';
import { Badge } from '@/components/reui/badge';
import { toast } from '@/components/toast';
import { formatSpan, formatUsd } from '@/features/AgentGoals/goalPresentation';
import {
  buildGoalGraphView,
  type GoalGraphView,
} from '@/features/AgentGoals/ProcessControl/goalGraphViewModel';
import { KindDot } from '@/features/AgentGoals/ProcessControl/shared';
import RunIntegrationTag from '@/features/AgentTasks/AgentTaskDetail/RunIntegrationTag';
import PortalBodyState from '@/features/Portal/components/PortalBodyState';
import { usePermission } from '@/hooks/usePermission';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';
import { goalSelectors, useGoalStore } from '@/store/goal';

/**
 * Drill-down behind each header metric of the goal detail page. Every view is
 * an honest projection of the `goal.graph` snapshot — where the product does
 * not yet model a number (per-round spend), the view says where the data
 * lives instead of inventing a value.
 */

const styles = createStaticStyles(({ css }) => ({
  label: css`
    font-size: 12px;
    font-weight: 600;
    color: ${cssVar.colorTextSecondary};
  `,
  mono: css`
    font-family: ${cssVar.fontFamilyCode};
    font-variant-numeric: tabular-nums;
  `,
  row: css`
    cursor: pointer;
    padding-block: 6px;
    padding-inline: 6px;
    border-radius: ${cssVar.borderRadiusSM};

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  staticRow: css`
    padding-block: 4px;
  `,
}));

const NodeRow = memo<{
  extra?: ReactNode;
  goalId: string;
  nodeId: string;
  graph: GoalGraphView;
}>(({ extra, goalId, graph, nodeId }) => {
  const openGoalNode = useChatStore((s) => s.openGoalNode);
  const view = graph.byId[nodeId];
  if (!view) return null;

  return (
    <div
      className={cx('flex flex-row items-center gap-2', styles.row)}
      onClick={() => openGoalNode(goalId, nodeId)}
    >
      {view.seq !== undefined && (
        <div
          className={cn('text-[12px] text-muted-foreground', styles.mono)}
          style={{ flex: 'none' }}
        >
          #{view.seq}
        </div>
      )}
      <KindDot kind={view.node.kind} />
      <div className="truncate min-w-0 font-medium" style={{ flex: 1, minWidth: 0 }}>
        {view.node.title}
      </div>
      {extra}
    </div>
  );
});

NodeRow.displayName = 'GoalMetricNodeRow';

const Lifecycle = memo<{ goalId: string; graph: GoalGraphView }>(({ graph }) => {
  const { t } = useTranslation('chat');
  const snapshot = useGoalStore(goalSelectors.goalGraph(graph.goal.id));
  const events = useMemo(
    () =>
      [...(snapshot?.events ?? [])].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [snapshot],
  );

  if (events.length === 0)
    return (
      <div className="text-[13px] text-muted-foreground">
        {t('goalProcess.metricDetail.lifecycle.empty')}
      </div>
    );

  return (
    <div className="flex flex-col gap-0">
      {events.map((event) => {
        const subject = graph.byId[event.entityId]?.node.title;
        return (
          <div
            className={cx('flex flex-row items-baseline gap-2.5', styles.staticRow)}
            key={event.id}
          >
            <div
              className={cn('text-[12px] text-muted-foreground', styles.mono)}
              style={{ flex: 'none' }}
            >
              {formatAbsoluteDateTime(event.createdAt)}
            </div>
            <div className="flex flex-col flex-1 gap-[1px]" style={{ minWidth: 0 }}>
              <div className="text-[13px]">
                {t(`goalProcess.eventType.${event.eventType}` as const)}
                {subject ? ` · ${subject}` : ''}
              </div>
              <div className="text-[12px] text-muted-foreground">
                {t(`goalProcess.actor.${event.actorType}` as const)}
                {event.reason ? ` · ${event.reason}` : ''}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

Lifecycle.displayName = 'GoalMetricLifecycle';

const Tasks = memo<{ goalId: string; graph: GoalGraphView }>(({ goalId, graph }) => {
  const { t } = useTranslation('chat');
  const works = graph.nodes.filter((view) => view.node.kind === 'task');

  return (
    <div className="flex flex-col gap-0">
      {works.map((view) => (
        <NodeRow
          goalId={goalId}
          graph={graph}
          key={view.node.id}
          nodeId={view.node.id}
          extra={
            <div className="flex flex-row items-center gap-1.5">
              {view.integration && (
                <RunIntegrationTag
                  integration={view.integration}
                  taskId={view.node.taskId ?? undefined}
                  topicId={view.integration.topicId}
                />
              )}
              <Badge size="sm" variant="secondary">
                {t(`goalProcess.nodeStatus.${view.node.status}` as const)}
              </Badge>
            </div>
          }
        />
      ))}
    </div>
  );
});

Tasks.displayName = 'GoalMetricTasks';

const Findings = memo<{ goalId: string; graph: GoalGraphView }>(({ goalId, graph }) => {
  const { t } = useTranslation('chat');
  const findings = [...graph.findings].sort(
    (a, b) =>
      (b.node.resolvedAt ?? b.node.createdAt).getTime() -
      (a.node.resolvedAt ?? a.node.createdAt).getTime(),
  );

  return (
    <div className="flex flex-col gap-0">
      {findings.map((view) => (
        <NodeRow
          goalId={goalId}
          graph={graph}
          key={view.node.id}
          nodeId={view.node.id}
          extra={
            view.producedBy ? (
              <div
                className="truncate min-w-0 text-[12px] text-muted-foreground"
                style={{ flexShrink: 1, minWidth: 0 }}
              >
                {t('goalProcess.findings.from', { title: view.producedBy.title })}
              </div>
            ) : undefined
          }
        />
      ))}
    </div>
  );
});

Findings.displayName = 'GoalMetricFindings';

/**
 * One budget dimension as `spent / cap`, where the cap IS the input — the
 * number you read and the number you change are the same number, so raising a
 * budget needs no separate edit mode.
 *
 * The draft is local and commits on blur / Enter: the goal graph polls while
 * the goal runs, and binding the field straight to the snapshot would wipe
 * half-typed digits on every refresh.
 *
 * `BUDGET_FIELDS` mirrors the router's zod contract per dimension, so a value
 * the form accepts cannot be one the server rejects. `null` clears a cap;
 * parallelism falls back to the coordinator's default rather than becoming
 * unbounded, which is why its blank label differs.
 */
const BUDGET_FIELDS = {
  maxConcurrentTasks: { max: 10, min: 1 },
  maxRounds: { min: 0 },
  maxTotalCost: { min: 0, money: true },
} as const;

const BudgetField = memo<{
  cap: number | null;
  field: keyof typeof BUDGET_FIELDS;
  goalId: string;
  label: string;
  /** Blank input meaning — 'uncapped' for budgets, 'auto' for parallelism. */
  placeholder?: string;
  used: number;
}>(({ cap, field, goalId, label, placeholder, used }) => {
  const { t } = useTranslation('chat');
  const { allowed: canEdit } = usePermission('create_content');
  const setGoalBudget = useGoalStore((s) => s.setGoalBudget);
  const [draft, setDraft] = useState<number | null>(cap);
  const [saving, setSaving] = useState(false);
  const meta = BUDGET_FIELDS[field];
  const money = 'money' in meta && meta.money;

  // Re-seed from the server whenever it disagrees and the user is not mid-edit.
  const [committed, setCommitted] = useState(cap);
  if (committed !== cap && !saving) {
    setCommitted(cap);
    setDraft(cap);
  }

  const commit = async () => {
    if (!canEdit || draft === cap) return;
    // A cap below what the goal already spent would park it immediately; that
    // is a legitimate way to stop a goal, so it is allowed — only nonsense
    // (below the field's floor) is refused, matching the router's bounds.
    if (draft !== null && (draft < meta.min || ('max' in meta && draft > meta.max))) {
      setDraft(cap);
      return;
    }

    try {
      setSaving(true);
      // Only the field that changed is sent: `setBudget` treats an omitted
      // dimension as untouched, so editing the cost cap keeps the round cap.
      await setGoalBudget(
        goalId,
        field === 'maxTotalCost'
          ? { maxTotalCost: draft }
          : field === 'maxRounds'
            ? { maxRounds: draft }
            : { maxConcurrentTasks: draft },
      );
    } catch (error) {
      console.error('[GoalMetricBudget] Failed to save:', error);
      toast.error(t('goalProcess.metricDetail.budget.saveFailed'));
      setDraft(cap);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-0.5">
      <span className={styles.label}>{label}</span>
      <div className="flex flex-row items-center gap-2">
        <div className={cn('font-semibold', styles.mono)} style={{ fontSize: 20 }}>
          {money ? formatUsd(used) : used}
        </div>
        <div className={cn('text-muted-foreground', styles.mono)} style={{ fontSize: 20 }}>
          /
        </div>
        <div
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commit();
          }}
        >
          <InputNumber
            className={styles.mono}
            controls={false}
            disabled={!canEdit || saving}
            min={meta.min}
            placeholder={placeholder ?? t('goalProcess.metricDetail.budget.uncapped')}
            prefix={money ? <div className="text-[12px] text-muted-foreground">$</div> : undefined}
            style={{ width: 120 }}
            value={draft}
            onChange={setDraft}
          />
        </div>
      </div>
    </div>
  );
});

BudgetField.displayName = 'GoalMetricBudgetField';

/** `12.4k` — token counts are read for magnitude, not audited digit by digit. */
const formatTokens = (value: number): string =>
  value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(value);

/**
 * Where the money went, one row per dispatched Task. The caps above answer
 * "how much is left"; without this the panel could not answer the question a
 * user actually arrives with — which Task is eating the budget.
 *
 * Rows are ordered by spend, and a Task whose runs have not settled shows $0
 * rather than being dropped: it is still consuming rounds.
 */
const CostBreakdown = memo<{ goalId: string; graph: GoalGraphView; spend?: GoalSpend }>(
  ({ goalId, graph, spend }) => {
    const { t } = useTranslation('chat');
    const openGoalNode = useChatStore((s) => s.openGoalNode);

    const rows = useMemo(() => {
      const nodeByTaskId = new Map(
        graph.nodes
          .filter((view) => view.node.taskId)
          .map((view) => [view.node.taskId!, view] as const),
      );
      return (spend?.byTask ?? [])
        .map((row) => ({ ...row, view: nodeByTaskId.get(row.taskId) }))
        .sort((a, b) => b.totalCost - a.totalCost || b.totalTokens - a.totalTokens);
    }, [graph, spend]);

    if (rows.length === 0)
      return (
        <div className="text-[13px] text-muted-foreground">
          {t('goalProcess.metricDetail.budget.perTaskEmpty')}
        </div>
      );

    return (
      <div className="flex flex-col gap-1">
        <span className={styles.label}>{t('goalProcess.metricDetail.budget.perTaskTitle')}</span>
        <div className="flex flex-col gap-0">
          {rows.map((row) => {
            const body = (
              <div className="flex flex-row items-center gap-2" key={row.taskId}>
                {row.view?.seq !== undefined && (
                  <div
                    className={cn('text-[12px] text-muted-foreground', styles.mono)}
                    style={{ flex: 'none' }}
                  >
                    #{row.view.seq}
                  </div>
                )}
                <div className="truncate min-w-0" style={{ flex: 1, minWidth: 0 }}>
                  {row.view?.node.title ?? row.taskId}
                </div>
                <div
                  className={cn('text-[12px] text-muted-foreground', styles.mono)}
                  style={{ flex: 'none' }}
                >
                  {t('goalProcess.metricDetail.budget.tokensValue', {
                    value: formatTokens(row.totalTokens),
                  })}
                </div>
                <div className={cn('font-medium', styles.mono)} style={{ flex: 'none' }}>
                  {formatUsd(row.totalCost)}
                </div>
              </div>
            );

            // A row without a graph node is a Task the snapshot no longer
            // carries — still billed, but nothing to open.
            return row.view ? (
              <div
                className={cx('flex flex-col', styles.row)}
                key={row.taskId}
                onClick={() => openGoalNode(goalId, row.view!.node.id)}
              >
                {body}
              </div>
            ) : (
              <div className={cx('flex flex-col', styles.staticRow)} key={row.taskId}>
                {body}
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);

CostBreakdown.displayName = 'GoalMetricCostBreakdown';

const Budget = memo<{ goalId: string; graph: GoalGraphView }>(({ goalId, graph }) => {
  const { t } = useTranslation('chat');
  const { config, maxRounds, maxTotalCost } = graph.goal;
  const snapshot = useGoalStore(goalSelectors.goalGraph(goalId));
  const spend = snapshot?.spend;
  // In-flight Tasks are what the cap bounds — the coordinator counts the same
  // population when deciding whether the frontier may dispatch further.
  const inFlight = graph.nodes.filter(
    (view) => view.node.kind === 'task' && view.node.status === 'active',
  ).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-[14px]">
        <span className={styles.label}>{t('goalProcess.metricDetail.budget.controlTitle')}</span>
        <BudgetField
          cap={maxTotalCost}
          field={'maxTotalCost'}
          goalId={goalId}
          label={t('goalProcess.metricDetail.budget.totalCost')}
          used={spend?.totalCost ?? 0}
        />
        <BudgetField
          cap={maxRounds}
          field={'maxRounds'}
          goalId={goalId}
          label={t('goalProcess.metricDetail.budget.rounds')}
          used={spend?.runs ?? 0}
        />
        <BudgetField
          cap={config?.maxConcurrentTasks ?? null}
          field={'maxConcurrentTasks'}
          goalId={goalId}
          label={t('goalProcess.metricDetail.budget.parallelism')}
          placeholder={t('goalProcess.metricDetail.budget.parallelismAuto')}
          used={inFlight}
        />
        {/* Raising a cap is how a user restarts a goal the coordinator parked on
            one — say so, because the alternative gesture (Resume) looks like the
            obvious one and does nothing while the budget is still binding. */}
        <div className="text-[12px] text-muted-foreground" style={{ lineHeight: 1.7 }}>
          {t('goalProcess.metricDetail.budget.raiseNote')}
        </div>
      </div>
      <CostBreakdown goalId={goalId} graph={graph} spend={spend} />
    </div>
  );
});

Budget.displayName = 'GoalMetricBudget';

const Duration = memo<{ goalId: string; graph: GoalGraphView }>(({ goalId, graph }) => {
  const { t } = useTranslation('chat');
  const { completedAt, startedAt } = graph.goal;
  const end = completedAt ?? new Date();
  const works = graph.nodes.filter((view) => view.node.kind === 'task' && view.attempts.length > 0);

  return (
    <div className="flex flex-col gap-[14px]">
      {startedAt && (
        <div className="flex flex-col gap-0.5">
          <span className={styles.label}>{t('goalProcess.metricDetail.duration.total')}</span>
          <div className={cn('font-semibold', styles.mono)} style={{ fontSize: 20 }}>
            {formatSpan(end.getTime() - startedAt.getTime())}
          </div>
          <div className="text-[12px] text-muted-foreground">
            {formatAbsoluteDateTime(startedAt)} →{' '}
            {completedAt
              ? formatAbsoluteDateTime(completedAt)
              : t('goalProcess.metricDetail.duration.now')}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <span className={styles.label}>{t('goalProcess.metricDetail.duration.taskSpans')}</span>
        <div className="flex flex-col gap-0">
          {works.map((view) => {
            const first = view.attempts[0];
            const last = view.attempts.at(-1)!;
            const spanEnd = last.endedAt ?? new Date();
            return (
              <NodeRow
                goalId={goalId}
                graph={graph}
                key={view.node.id}
                nodeId={view.node.id}
                extra={
                  <div
                    className={cn('text-[12px] text-muted-foreground', styles.mono)}
                    style={{ flex: 'none' }}
                  >
                    {dayjs(first.startedAt).format('HH:mm')}–
                    {last.endedAt ? dayjs(last.endedAt).format('HH:mm') : '…'} ·{' '}
                    {formatSpan(spanEnd.getTime() - first.startedAt.getTime())}
                  </div>
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
});

Duration.displayName = 'GoalMetricDuration';

const Liveness = memo<{ goalId: string; graph: GoalGraphView }>(({ goalId, graph }) => {
  const { t } = useTranslation('chat');
  const latest = useMemo(
    () =>
      graph.nodes.reduce<Date | undefined>((max, view) => {
        const at = view.node.updatedAt;
        return !max || at > max ? at : max;
      }, undefined),
    [graph],
  );
  const running = graph.nodes.filter(
    (view) => view.node.kind === 'task' && view.node.status === 'active',
  );

  return (
    <div className="flex flex-col gap-[14px]">
      <div className="flex flex-col gap-0.5">
        <span className={styles.label}>{t('goalProcess.metricDetail.liveness.latest')}</span>
        <div className={cn('font-semibold', styles.mono)} style={{ fontSize: 20 }}>
          {latest ? formatAbsoluteDateTime(latest) : '—'}
        </div>
      </div>
      {running.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className={styles.label}>{t('goalProcess.metricDetail.liveness.running')}</span>
          <div className="flex flex-col gap-0">
            {running.map((view) => (
              <NodeRow goalId={goalId} graph={graph} key={view.node.id} nodeId={view.node.id} />
            ))}
          </div>
        </div>
      )}
      {/* The contract that makes "walk away" safe: event-driven advancement
          plus the recovery sweep. State it where the user checks for a pulse. */}
      <div className="text-[12px] text-muted-foreground" style={{ lineHeight: 1.7 }}>
        {t('goalProcess.metricDetail.liveness.driver')}
      </div>
    </div>
  );
});

Liveness.displayName = 'GoalMetricLiveness';

const Body = memo(() => {
  const { t } = useTranslation('chat');
  const view = useChatStore(chatPortalSelectors.goalMetricView);
  const snapshot = useGoalStore(goalSelectors.goalGraph(view?.goalId ?? ''));
  const useFetchGoalGraph = useGoalStore((s) => s.useFetchGoalGraph);
  // Same SWR key as the goal page, so this shares its request; it only adds the
  // loading / error status the store snapshot alone cannot express.
  const { error, isLoading, mutate } = useFetchGoalGraph(view?.goalId);
  const graph = useMemo(() => (snapshot ? buildGoalGraphView(snapshot) : undefined), [snapshot]);

  if (!view) return null;
  if (!graph) {
    return (
      <PortalBodyState
        error={error}
        isLoading={isLoading}
        notFoundDesc={t('goalDetail.notFoundDescription')}
        notFoundTitle={t('goalDetail.notFoundTitle')}
        onRetry={() => void mutate()}
      />
    );
  }
  const { goalId, metric } = view;

  return (
    <div className="flex flex-col flex-1 p-4" style={{ minHeight: 0, overflowY: 'auto' }}>
      {metric === 'lifecycle' && <Lifecycle goalId={goalId} graph={graph} />}
      {metric === 'tasks' && <Tasks goalId={goalId} graph={graph} />}
      {metric === 'findings' && <Findings goalId={goalId} graph={graph} />}
      {metric === 'budget' && <Budget goalId={goalId} graph={graph} />}
      {metric === 'duration' && <Duration goalId={goalId} graph={graph} />}
      {metric === 'liveness' && <Liveness goalId={goalId} graph={graph} />}
    </div>
  );
});

export default Body;
