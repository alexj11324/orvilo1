'use client';

import { EyeIcon, PauseIcon, PlayIcon } from 'lucide-react';
import { memo, type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import NotFound from '@/components/404';
import AsyncError from '@/components/AsyncError';
import GoalDetailSkeleton from '@/components/Skeleton/GoalDetail';
import { Button } from '@/components/ui/button';
import AgentBreadcrumb from '@/features/AgentBreadcrumb';
import { useAgentRoutePath } from '@/features/AgentBreadcrumb/useAgentRoutePath';
import NavHeader from '@/features/NavHeader';
import { PortalContent } from '@/features/Portal/router';
import { usePortalPanelWidth } from '@/features/Portal/usePortalPanelWidth';
import RightPanel from '@/features/RightPanel';
import ToggleRightPanelButton from '@/features/RightPanel/ToggleRightPanelButton';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useActivityTime } from '@/hooks/useActivityTime';
import { usePermission } from '@/hooks/usePermission';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';
import { type GoalMetricKind } from '@/store/chat/slices/portal/initialState';
import { goalSelectors, useGoalStore } from '@/store/goal';

import GoalChat from './GoalChat';
import GoalDetailActions from './GoalDetailActions';
import {
  formatSpan,
  formatUsd,
  goalManagerConversation,
  goalStatusKey,
  summarizeGoalBudget,
} from './goalPresentation';
import GoalRequirement from './GoalRequirement';
import GoalStatusGlyph from './GoalStatusGlyph';
import { GoalSupervision } from './GoalSupervision';
import NorthStarMetrics from './NorthStarMetrics';
import ProcessControl from './ProcessControl';
import { useGoalChatPanel } from './useGoalChatPanel';

/**
 * The goal detail page. A goal is a Goal Graph — it owns its own decomposition
 * and dispatches its own Tasks — so the page reads the graph snapshot directly and
 * the route is keyed by the `goals` row id.
 *
 * Every header metric is a drill-down entry: clicking one opens its detail in
 * the right-hand Portal, the same panel the process-control band drills into
 * (node → task → topic conversation).
 */

const styles = {
  header: '[padding-block:8px_4px]',
  metric:
    'cursor-pointer min-w-28 [padding-block:4px] [padding-inline:10px] rounded-(--ant-border-radius) [transition:background_0.15s] hover:bg-(--ant-color-fill-quaternary)',
  metrics: '-ms-2.5',
};

const Metric = memo<{
  label: string;
  onClick: () => void;
  value: ReactNode;
}>(({ label, onClick, value }) => (
  <div className={`flex flex-col gap-0.5 ${styles.metric}`} onClick={onClick}>
    <div className="flex items-center gap-[7px]" style={{ minHeight: 26 }}>
      {value}
    </div>
    <div className="text-[12px] text-muted-foreground">{label}</div>
  </div>
));

Metric.displayName = 'GoalHeaderMetric';

/** Relative "last activity" readout; isolated so its refresh never re-renders the page.
 *  Plain text on purpose: the status control already carries the "running"
 *  animation, and a second spinner here said the same thing twice. */
const LivenessValue = memo<{ latest?: Date }>(({ latest }) => {
  const { text } = useActivityTime(latest);
  return <div className="text-[16px] font-semibold">{text || '—'}</div>;
});

LivenessValue.displayName = 'GoalLivenessValue';

interface GoalDetailPageProps {
  /** Absent for a goal with no responsible agent — e.g. one created from a project. */
  agentId?: string;
  goalId: string;
}

const GoalDetailPage = memo<GoalDetailPageProps>(({ agentId, goalId }) => {
  const { t } = useTranslation('chat');
  const { allowed: canEdit } = usePermission('create_content');
  const useFetchGoalGraph = useGoalStore((s) => s.useFetchGoalGraph);
  const { error, isLoading, mutate } = useFetchGoalGraph(goalId);
  const snapshot = useGoalStore(goalSelectors.goalGraph(goalId));
  const pauseGoal = useGoalStore((s) => s.pauseGoal);
  const resumeGoal = useGoalStore((s) => s.resumeGoal);

  const buildAgentPath = useAgentRoutePath(agentId ?? '');

  const showPortal = useChatStore(chatPortalSelectors.showPortal);
  const currentViewType = useChatStore(chatPortalSelectors.currentViewType);
  const chat = useGoalChatPanel(goalId, agentId);
  const openGoalMetric = useChatStore((s) => s.openGoalMetric);
  const clearPortalStack = useChatStore((s) => s.clearPortalStack);

  // While the exploration map runs fullscreen its overlay carries the portal
  // panel; ours unmounts so exactly one PortalContent is alive at a time.
  const [graphFullscreen, setGraphFullscreen] = useState(false);

  // Same per-view width grammar as the conversation portal, but remembered
  // under the 'goal' scope: resizing here never affects the chat surface.
  const { maxWidth, minWidth, updateWidth, width } = usePortalPanelWidth(currentViewType, 'goal');

  // The portal stack belongs to this goal's inspection session — leaving the
  // page (or switching goals) must not leak it into the conversation surface.
  useEffect(() => () => clearPortalStack(), [clearPortalStack, goalId]);

  const liveness = useMemo(() => {
    if (!snapshot) return { latest: undefined };
    let latest: Date | undefined;
    for (const node of snapshot.nodes) {
      if (!latest || node.updatedAt > latest) latest = node.updatedAt;
    }
    return { latest };
  }, [snapshot]);

  if (error && !snapshot) return <AsyncError error={error} variant={'page'} onRetry={mutate} />;
  if (!snapshot)
    return isLoading ? (
      <GoalDetailSkeleton />
    ) : (
      <NotFound desc={t('goalDetail.notFoundDescription')} title={t('goalDetail.notFoundTitle')} />
    );

  const { goal, nodes } = snapshot;
  const managerConversation = goalManagerConversation(goal.config);
  const tasks = nodes.filter((node) => node.kind === 'task').length;
  const findings = nodes.filter((node) => node.kind === 'finding').length;
  const open = (metric: GoalMetricKind) => () => openGoalMetric(goalId, metric);

  // The panel hosts the goal conversation only when the goal has a
  // responsible agent; without one it is drill-down-only.
  const panelExpandable = !!chat.agentId;
  const chatVisible = chat.open && panelExpandable;

  const paused = goal.status === 'paused';
  // Pace control exists only while the coordinator loop is actually moving (or
  // explicitly paused). A goal in review awaits the human, and a closed goal
  // cannot move — pausing either would be a dead or misleading button.
  const canPause =
    canEdit &&
    nodes.length > 0 &&
    ['paused', 'planning', 'running', 'verifying'].includes(goal.status);

  const durationText = goal.startedAt
    ? formatSpan((goal.completedAt ?? new Date()).getTime() - goal.startedAt.getTime())
    : '—';
  // Spend is the metric; the cap is the context it is read against — see
  // `summarizeGoalBudget`. The label names only the number in the lead, and the
  // cap trails it at secondary weight rather than sharing top billing.
  const budget = summarizeGoalBudget(goal, snapshot.spend);
  const budgetLabel = t(
    budget.kind === 'rounds' ? 'goalProcess.metrics.rounds' : 'goalProcess.metrics.spend',
  );
  const budgetLead =
    budget.kind === 'cost'
      ? formatUsd(budget.spent)
      : budget.kind === 'rounds'
        ? String(budget.runs)
        : formatUsd(budget.spent);
  const budgetTrail =
    budget.kind === 'cost'
      ? `/ ${formatUsd(budget.cap)}`
      : budget.kind === 'rounds'
        ? `/ ${t('goalProcess.metrics.roundsValue', { count: budget.cap })}`
        : t('goalProcess.metrics.uncapped');

  return (
    <div className="flex flex-1 h-full" style={{ overflow: 'hidden' }}>
      <div className="flex flex-col flex-1 h-full" style={{ minWidth: 0 }}>
        <NavHeader
          left={
            <div className="flex items-center gap-1">
              {agentId ? (
                <AgentBreadcrumb
                  agentId={agentId}
                  extraItems={[goal.title]}
                  // The goal title owns the last crumb, so this one is a way back
                  // to the agent's goal list rather than a label for this page.
                  title={<Link to={buildAgentPath('goals')}>{t('goalList.title')}</Link>}
                />
              ) : (
                <div className="text-[14px] font-medium">{goal.title}</div>
              )}
              {/* Not nested under the breadcrumb: an agent-less goal still has to
                  be deletable, and this menu is the only place that can do it. */}
              <GoalDetailActions agentId={agentId} goalId={goal.id} projectId={goal.projectId} />
            </div>
          }
          right={
            graphFullscreen ? undefined : (
              <div className="flex items-center gap-2">
                {managerConversation && (
                  <Button
                    size="sm"
                    onClick={() => {
                      clearPortalStack();
                      chat.openSupervision(managerConversation);
                    }}
                  >
                    <EyeIcon data-icon="inline-start" />
                    {t('goalProcess.manager.viewTrace')}
                  </Button>
                )}
                {panelExpandable && (
                  <ToggleRightPanelButton
                    hideWhenExpanded
                    expand={showPortal || chatVisible}
                    onToggle={() => chat.setOpen(true)}
                  />
                )}
              </div>
            )
          }
        />
        <div className="flex flex-col flex-1" style={{ overflowY: 'auto' }}>
          <WideScreenContainer wrapperStyle={{ gap: 20, paddingBlock: 16 }}>
            <div className={`flex flex-col gap-2 ${styles.header}`}>
              <h1 className="text-[22px] font-semibold">{goal.title}</h1>
              <div className={`flex gap-2 flex-wrap ${styles.metrics}`}>
                <Metric
                  label={t('goalProcess.metrics.status')}
                  value={
                    <>
                      <GoalStatusGlyph size={16} status={goal.status} />
                      <div className="text-[16px] font-semibold">
                        {t(goalStatusKey(goal.status))}
                      </div>
                    </>
                  }
                  onClick={open('lifecycle')}
                />
                <Metric
                  label={t('goalProcess.metrics.tasks')}
                  value={<div className="text-[16px] font-semibold">{tasks}</div>}
                  onClick={open('tasks')}
                />
                <Metric
                  label={t('goalProcess.metrics.findings')}
                  value={<div className="text-[16px] font-semibold">{findings}</div>}
                  onClick={open('findings')}
                />
                <Metric
                  label={budgetLabel}
                  value={
                    <>
                      <div className="text-[16px] font-semibold">{budgetLead}</div>
                      <div className="text-[12px] text-muted-foreground">{budgetTrail}</div>
                    </>
                  }
                  onClick={open('budget')}
                />
                <Metric
                  label={t('goalProcess.metrics.duration')}
                  value={<div className="text-[16px] font-semibold">{durationText}</div>}
                  onClick={open('duration')}
                />
                <Metric
                  label={t('goalProcess.metrics.liveness')}
                  value={<LivenessValue latest={liveness.latest} />}
                  onClick={open('liveness')}
                />
              </div>
              {/* Pause/resume above the requirement document — its reviewed
                  home. The status glyph keeps the "running" animation; this
                  button is only the control. */}
              {canPause && (
                <div className="flex items-center gap-2.5" style={{ paddingBlock: '8px 0' }}>
                  <Button
                    variant={paused ? 'default' : 'outline'}
                    onClick={() => void (paused ? resumeGoal(goal.id) : pauseGoal(goal.id))}
                  >
                    {paused ? (
                      <PlayIcon data-icon="inline-start" />
                    ) : (
                      <PauseIcon data-icon="inline-start" />
                    )}
                    {paused ? t('goalProcess.resume') : t('goalProcess.pause')}
                  </Button>
                  {paused && (
                    <div className="text-[12px] text-muted-foreground">
                      {t('goalProcess.paused')}
                    </div>
                  )}
                </div>
              )}
              {goal.requirement && (
                <GoalRequirement goalId={goal.id} requirement={goal.requirement} />
              )}
              {/* North-star strip beside the requirement document: the measured
                  clauses ARE half of the acceptance contract, so they read
                  with it — not squeezed between the title and the execution
                  metrics (review feedback, r1). */}
              <NorthStarMetrics canEdit={canEdit} goalId={goalId} />
            </div>

            <ProcessControl
              goalId={goal.id}
              graphFullscreen={graphFullscreen}
              onGraphFullscreenChange={setGraphFullscreen}
            />
          </WideScreenContainer>
        </div>
      </div>

      {/* Same Portal the conversation surface uses — the drill-down chain
          (metric / node → task detail → topic) rides its view stack, and the
          header's back arrow and close come for free. When no drill-down is
          open, the panel hosts the conversation with the goal's responsible
          agent so a user can just ask about progress. */}
      <RightPanel
        expand={(showPortal || chatVisible) && !graphFullscreen}
        maxWidth={maxWidth}
        minWidth={minWidth}
        width={width}
        onSizeChange={(size) => updateWidth(size?.width)}
        onExpandChange={(next) => {
          if (!next) clearPortalStack();
          chat.setOpen(next);
        }}
      >
        {graphFullscreen ? null : showPortal ? (
          <PortalContent />
        ) : chat.agentId && chat.topicId ? (
          <GoalSupervision
            agentId={chat.agentId}
            goalId={goalId}
            key={`${goalId}:${chat.agentId}:${chat.request}`}
            topicId={chat.topicId}
            onCollapse={() => chat.setOpen(false)}
          />
        ) : chat.agentId ? (
          <GoalChat
            agentId={chat.agentId}
            goalId={goalId}
            initialTopicId={chat.topicId}
            key={`${goalId}:${chat.agentId}:${chat.request}`}
            onCollapse={() => chat.setOpen(false)}
          />
        ) : null}
      </RightPanel>
    </div>
  );
});

GoalDetailPage.displayName = 'GoalDetailPage';

export default GoalDetailPage;
