import { Markdown } from '@lobehub/ui';
import { formatAbsoluteDateTime } from '@orvilo/utils/time';
import { cn } from 'cn';
import { SquareArrowOutUpRight } from 'lucide-react';
import { memo, type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { ExperimentDetail } from '@/features/AgentGoals/Experiments/Detail';
import { isExperiment } from '@/features/AgentGoals/Experiments/model';
import {
  coordinatorGateReason,
  coordinatorReasonCopy,
  viewGateKind,
} from '@/features/AgentGoals/ProcessControl/coordinatorCopy';
import {
  buildGoalGraphView,
  type GoalNodeView,
} from '@/features/AgentGoals/ProcessControl/goalGraphViewModel';
import { KindDot } from '@/features/AgentGoals/ProcessControl/shared';
import PortalBodyState from '@/features/Portal/components/PortalBodyState';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';
import { goalSelectors, useGoalStore } from '@/store/goal';

/**
 * Drill-down for one Goal Graph node. Everything rendered here is derived from
 * the same `goal.graph` snapshot the page already holds — no extra fetch. A
 * Work node links onward to its Task detail (the deep half of the chain:
 * node → task → topic conversation).
 */

const styles = {
  attempt: 'py-1.5 [&+&]:[border-block-start:1px_dashed_var(--sidebar-border)]',
  label: 'text-[12px] font-semibold text-muted-foreground',
  linkRow: 'cursor-pointer rounded-(--ant-border-radius-sm) hover:bg-(--ant-color-fill-quaternary)',
  mono: 'font-mono tabular-nums',
};

const Section = memo<{ children: ReactNode; title: string }>(({ children, title }) => (
  <div className="flex flex-col gap-1.5">
    <span className={styles.label}>{title}</span>
    {children}
  </div>
));

Section.displayName = 'GoalNodePortalSection';

/** The complete ledger — unlike the frontier row, no rank gate hides it here. */
const AttemptLedger = memo<{ view: GoalNodeView }>(({ view }) => {
  const { t } = useTranslation('chat');
  if (view.attempts.length === 0) return null;

  return (
    <Section title={t('goalProcess.attempts.title')}>
      <div className="flex flex-col gap-0">
        {view.attempts.map((attempt) => (
          <div
            className={cn('flex flex-row items-baseline gap-2.5', styles.attempt)}
            key={attempt.index}
          >
            <div
              className={cn('text-[12px] text-muted-foreground', styles.mono)}
              style={{ flex: 'none' }}
            >
              {formatAbsoluteDateTime(attempt.startedAt)}
            </div>
            <div className="text-[12px] text-muted-foreground" style={{ flex: 'none' }}>
              {t('goalProcess.attempts.nth', { index: attempt.index })}
            </div>
            <div
              style={{ flex: 'none' }}
              className={cn(
                'text-[12px]',
                attempt.outcome === 'passed'
                  ? 'text-success'
                  : attempt.outcome === 'failed'
                    ? 'text-destructive'
                    : 'text-muted-foreground',
              )}
            >
              {t(`goalProcess.attempts.${attempt.outcome}` as const)}
            </div>
            <div className="text-[12px] text-muted-foreground" style={{ flex: 1, minWidth: 0 }}>
              {attempt.reason ?? ''}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
});

AttemptLedger.displayName = 'GoalNodePortalAttempts';

const NodeLinkRow = memo<{ onClick: () => void; text: string; view: GoalNodeView }>(
  ({ onClick, text, view }) => (
    <div
      className={cn('flex flex-row items-center gap-1.5 py-1 px-1', styles.linkRow)}
      onClick={onClick}
    >
      <KindDot kind={view.node.kind} />
      <div className="truncate min-w-0 text-[12px] text-muted-foreground">{text}</div>
    </div>
  ),
);

NodeLinkRow.displayName = 'GoalNodePortalLink';

const Body = memo(() => {
  const { t } = useTranslation('chat');
  const view = useChatStore(chatPortalSelectors.goalNodeView);
  const openTaskDetail = useChatStore((s) => s.openTaskDetail);
  const openGoalNode = useChatStore((s) => s.openGoalNode);
  const snapshot = useGoalStore(goalSelectors.goalGraph(view?.goalId ?? ''));
  const useFetchGoalGraph = useGoalStore((s) => s.useFetchGoalGraph);
  // Same SWR key as the goal page, so this shares its request; it only adds the
  // loading / error status the store snapshot alone cannot express.
  const { error, isLoading, mutate } = useFetchGoalGraph(view?.goalId);

  const graph = useMemo(() => (snapshot ? buildGoalGraphView(snapshot) : undefined), [snapshot]);
  if (!view) return null;

  const nodeView = graph?.byId[view.nodeId];
  if (!graph || !snapshot || !nodeView) {
    return (
      <PortalBodyState
        error={snapshot ? undefined : error}
        isLoading={!snapshot && isLoading}
        notFoundDesc={t('goalDetail.notFoundDescription')}
        notFoundTitle={t('goalDetail.notFoundTitle')}
        onRetry={() => void mutate()}
      />
    );
  }
  const { node } = nodeView;
  if (isExperiment(graph, nodeView))
    return (
      <ExperimentDetail graph={graph} snapshot={snapshot} view={nodeView}>
        <AttemptLedger view={nodeView} />
      </ExperimentDetail>
    );
  const isFinding = node.kind === 'finding';

  // Coordinator gates localize; arbitrary gates keep their stored copy.
  const gateKind = node.kind === 'decision' ? viewGateKind(nodeView) : undefined;
  const rawGateReason = gateKind ? coordinatorGateReason(nodeView.decision?.question) : undefined;
  const gateReasonCopy = coordinatorReasonCopy(rawGateReason);
  const gateReasonText = gateReasonCopy
    ? t(gateReasonCopy.key as any, gateReasonCopy.params)
    : rawGateReason;

  return (
    <div className="flex flex-col flex-1 gap-4 p-4" style={{ minHeight: 0, overflowY: 'auto' }}>
      <div className="flex flex-row items-center gap-2">
        <Badge size="sm" variant="secondary">
          {t(`goalProcess.kind.${node.kind}` as const)}
        </Badge>
        <Badge size="sm" variant="secondary">
          {t(`goalProcess.nodeStatus.${node.status}` as const)}
        </Badge>
        {nodeView.humanTouches.length > 0 && (
          <Badge size="sm" variant="secondary">
            {t('goalProcess.node.humanTouched')}
          </Badge>
        )}
      </div>

      {node.description &&
        (isFinding ? (
          // A finding's description is the run's handoff — real Markdown, so
          // render it as such instead of pre-wrapped source text. `flex-shrink: 0`
          // is load-bearing: Markdown's root is `overflow: hidden`, so as a flex
          // item its automatic minimum size collapses to 0 and a long handoff
          // would be squeezed (and clipped) to fit instead of scrolling the panel.
          <Markdown fontSize={13} style={{ flexShrink: 0 }} variant={'chat'}>
            {node.description}
          </Markdown>
        ) : (
          <Section
            title={
              node.kind === 'task'
                ? t('goalProcess.node.instruction')
                : t('goalProcess.node.description')
            }
          >
            <div className="text-[13px]" style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {node.description}
            </div>
          </Section>
        ))}

      {node.kind === 'decision' && nodeView.decision && (
        <Section title={t('goalProcess.gate.decisionPointLabel')}>
          {/* State the problem itself; the resolution options carry the choices. */}
          <div className="text-[13px]">{gateReasonText ?? nodeView.decision.question}</div>
        </Section>
      )}

      <AttemptLedger view={nodeView} />

      {nodeView.findings.length > 0 && (
        <Section title={t('goalProcess.node.producedFindings')}>
          <div className="flex flex-col gap-0.5">
            {nodeView.findings.map((finding) => {
              const findingView = graph.byId[finding.id];
              if (!findingView) return null;
              return (
                <NodeLinkRow
                  key={finding.id}
                  text={finding.title}
                  view={findingView}
                  onClick={() => openGoalNode(view.goalId, finding.id)}
                />
              );
            })}
          </div>
        </Section>
      )}

      {nodeView.producedBy && graph.byId[nodeView.producedBy.id] && (
        <Section title={t('goalProcess.node.producedByTitle')}>
          <NodeLinkRow
            text={nodeView.producedBy.title}
            view={graph.byId[nodeView.producedBy.id]}
            onClick={() => openGoalNode(view.goalId, nodeView.producedBy!.id)}
          />
        </Section>
      )}

      {nodeView.blockers.length > 0 && (
        <Section title={t('goalProcess.node.blockers')}>
          <div className="flex flex-col gap-0.5">
            {nodeView.blockers.map((blocker) => {
              const blockerView = graph.byId[blocker.id];
              if (!blockerView) return null;
              return (
                <NodeLinkRow
                  key={blocker.id}
                  text={blocker.title}
                  view={blockerView}
                  onClick={() => openGoalNode(view.goalId, blocker.id)}
                />
              );
            })}
          </div>
        </Section>
      )}

      {node.taskId && (
        <Button
          size="sm"
          style={{ alignSelf: 'flex-start' }}
          variant="outline"
          onClick={() => openTaskDetail(node.taskId!)}
        >
          <span className="anticon" role="img">
            <SquareArrowOutUpRight fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
          </span>
          {t('goalProcess.node.openTask')}
        </Button>
      )}
    </div>
  );
});

export default Body;
