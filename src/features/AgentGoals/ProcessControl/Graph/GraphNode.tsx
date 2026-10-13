'use client';

import { Handle, type NodeProps, Position } from '@xyflow/react';
import { clsx as cx } from 'cn';
import { AtSign, FileBox, type LucideIcon, Repeat2 } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { TASK_STATUS_VISUALS } from '@/components/ExecutionStatus';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import RunIntegrationTag from '@/features/AgentTasks/AgentTaskDetail/RunIntegrationTag';
import RunningGlyph from '@/features/Home/components/RunningGlyph';
import { shinyTextStyles } from '@/styles';

import type { GoalGraphNodeKind } from '../../Experiments/model';
import { coordinatorNodeTitleKey } from '../coordinatorCopy';
import type { GoalNodeView } from '../goalGraphViewModel';
import { KIND_COLOR, KIND_ICON } from '../shared';
import { useElapsed } from '../useElapsed';
import { experimentStatusVisual } from './experimentStatus';
import nativeStyles from './Graph.module.css';

/**
 * A graph card: leading kind icon on a tinted square, title plus a one-line
 * subtitle, a state chip on the top edge, and — for a task — a metric strip
 * (attempts · artifacts · running clock) so the map answers "who is
 * on it, did it produce anything" without opening a node.
 */

export interface GraphNodeData extends Record<string, unknown> {
  dim: boolean;
  isGate: boolean;
  kind?: GoalGraphNodeKind;
  memberCount?: number;
  running: boolean;
  selected: boolean;
  stale: boolean;
  subtitle: string;
  view: GoalNodeView;
}

const styles = {
  card: `transition-orvilo-goal-card ${nativeStyles.card}`,
  chipText: nativeStyles.chipText,
  dim: nativeStyles.dim,
  statusRow: nativeStyles.statusRow,
  gate: nativeStyles.gate,
  ghost: nativeStyles.ghost,
  ghostBar: `animate-orvilo-goal-ghost ${nativeStyles.ghostBar}`,
  glyph: nativeStyles.glyph,
  handle: nativeStyles.handle,
  head: nativeStyles.head,
  human: nativeStyles.human,
  metric: nativeStyles.metric,
  metrics: nativeStyles.metrics,
  selected: nativeStyles.selected,
  stale: nativeStyles.stale,
  subtitle: nativeStyles.subtitle,
  title: nativeStyles.title,
};

interface StateChip {
  color: string;
  /** The task family's status glyph; running renders the animated ring instead. */
  icon?: LucideIcon;
  text: string;
}

const useStateChip = (data: GraphNodeData): StateChip | null => {
  const { t } = useTranslation('chat');
  const { isGate, running, stale, view } = data;
  const { node } = view;

  if (node.kind === 'experiment')
    return {
      ...experimentStatusVisual(node.status),
      text: t(`goalExperiment.status.${node.status}`),
    };
  if (isGate)
    return {
      color: TASK_STATUS_VISUALS.paused.color,
      icon: TASK_STATUS_VISUALS.paused.icon,
      text: t('goalProcess.tag.needsDecision'),
    };
  if (stale)
    return {
      color: TASK_STATUS_VISUALS.failed.color,
      icon: TASK_STATUS_VISUALS.failed.icon,
      text: t('goalProcess.tag.lost'),
    };
  // Running renders the same animated ring the frontier and home surfaces use.
  if (running)
    return { color: TASK_STATUS_VISUALS.running.color, text: t('goalProcess.node.running') };
  if (node.kind === 'task' && node.status === 'resolved')
    return {
      color: TASK_STATUS_VISUALS.completed.color,
      icon: TASK_STATUS_VISUALS.completed.icon,
      text: t('goalProcess.node.done'),
    };
  if (node.kind === 'task' && (node.status === 'retired' || node.status === 'rejected'))
    return {
      color: TASK_STATUS_VISUALS.canceled.color,
      icon: TASK_STATUS_VISUALS.canceled.icon,
      text: t('goalProcess.tag.retired'),
    };
  if (node.kind === 'decision' && node.status === 'resolved')
    return {
      color: 'var(--foreground-tertiary)',
      icon: TASK_STATUS_VISUALS.completed.icon,
      text: view.humanTouches.length
        ? t('goalProcess.node.decidedByYou')
        : t('goalProcess.node.decidedByAgent'),
    };
  // Every task reads its state in the same top row — a queued one included,
  // so "not dispatched" no longer hides in the metric strip.
  if (node.kind === 'task')
    return {
      color: TASK_STATUS_VISUALS.backlog.color,
      icon: TASK_STATUS_VISUALS.backlog.icon,
      text: node.taskId
        ? t(`goalProcess.nodeStatus.${node.status}` as const)
        : t('goalProcess.node.unassigned'),
    };
  return null;
};

const RunningClock = memo<{ startedAt?: Date }>(({ startedAt }) => {
  const elapsed = useElapsed(startedAt);
  if (!elapsed) return null;
  // Sits right behind the state chip in the status row — no auto margin. The
  // clock is ambient context, so it reads in a light tint, not body color.
  return <span className="text-xs leading-5 text-foreground-tertiary">{elapsed}</span>;
});

RunningClock.displayName = 'GoalGraphRunningClock';

const GraphNodeView = memo<NodeProps>(({ data }) => {
  const { t } = useTranslation('chat');
  const nodeData = data as GraphNodeData;
  const { dim, isGate, running, selected, stale, subtitle, view } = nodeData;
  const { node } = view;
  const chip = useStateChip(nodeData);
  const kind = nodeData.kind ?? node.kind;
  const palette = KIND_COLOR[kind];
  const isTask = node.kind === 'task';
  const attempts = view.attempts.length;
  // Coordinator-authored node titles are English; recognized ones localize.
  const coordinatorTitleKey = coordinatorNodeTitleKey(view);

  return (
    <div className="relative">
      <Handle
        className={styles.handle}
        isConnectable={false}
        position={Position.Top}
        type={'target'}
      />
      <div
        className={cx(
          styles.card,
          isGate && styles.gate,
          stale && styles.stale,
          dim && styles.dim,
          selected && styles.selected,
        )}
      >
        {/* Status reads first: its own top row, left-aligned, with the running
            clock riding right behind it (review: bottom placements read poorly). */}
        {(chip || view.humanTouches.length > 0) && (
          <div className={styles.statusRow}>
            {kind === 'experiment' && (
              <span className={styles.chipText} style={{ color: palette.line }}>
                {t('goalExperiment.number', { number: view.seq })}
              </span>
            )}
            {chip && (
              <div className="flex items-center gap-1.25">
                {chip.icon ? (
                  <chip.icon color={chip.color} size={16} />
                ) : (
                  <RunningGlyph size={16} />
                )}
                <span className={styles.chipText} style={{ color: chip.color }}>
                  {chip.text}
                </span>
              </div>
            )}
            {running && <RunningClock startedAt={view.startedAt} />}
            {view.humanTouches.length > 0 && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span>
                      <span className={styles.human}>
                        <AtSign aria-hidden size={16} />
                      </span>
                    </span>
                  }
                />
                <TooltipContent>{t('goalProcess.node.humanTouched')}</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
        <div className={styles.head}>
          <div className={styles.glyph} style={{ background: palette.soft, color: palette.line }}>
            {createElement(KIND_ICON[kind], { size: 16 })}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={styles.title}>
              {coordinatorTitleKey ? t(coordinatorTitleKey as any) : node.title}
            </span>
            {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
          </div>
        </div>
        {node.kind === 'experiment' && (
          <div className={styles.metrics}>
            {t('goalExperiment.members', { count: nodeData.memberCount ?? 0 })} ·{' '}
            {t('goalExperiment.enter')}
          </div>
        )}
        {isTask && (
          <div className={styles.metrics}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span>
                    <span className={styles.metric}>
                      <Repeat2 size={16} />
                      {attempts}
                    </span>
                  </span>
                }
              />
              <TooltipContent>
                {t('goalProcess.node.attemptsTooltip', { count: attempts })}
              </TooltipContent>
            </Tooltip>
            {view.artifacts.length > 0 && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span>
                      <span className={styles.metric}>
                        <FileBox size={16} />
                        {view.artifacts.length}
                      </span>
                    </span>
                  }
                />
                <TooltipContent>
                  {t('goalProcess.node.artifactsTooltip', { count: view.artifacts.length })}
                </TooltipContent>
              </Tooltip>
            )}
            {/* The same chip the task detail carries — the run's branch on its
                way back onto base, so a resolved node still shows whether the
                work landed and why it did not. */}
            {view.integration && (
              <RunIntegrationTag
                integration={view.integration}
                taskId={node.taskId ?? undefined}
                topicId={view.integration.topicId}
              />
            )}
          </div>
        )}
      </div>
      <Handle
        className={styles.handle}
        isConnectable={false}
        position={Position.Bottom}
        type={'source'}
      />
    </div>
  );
});

GraphNodeView.displayName = 'GoalGraphNodeView';

/**
 * A placeholder card shown while the coordinator is still decomposing the goal:
 * same silhouette as a task node, dashed and pulsing, so the map promises the
 * structure that is about to arrive instead of sitting empty.
 */
export const GhostNodeView = memo(() => {
  const { t } = useTranslation('chat');
  return (
    <div className="relative">
      <Handle
        className={styles.handle}
        isConnectable={false}
        position={Position.Top}
        type={'target'}
      />
      <div className={cx(styles.card, styles.ghost)}>
        <div className={styles.head}>
          <div
            className={styles.glyph}
            style={{ background: KIND_COLOR.task.soft, color: KIND_COLOR.task.line }}
          >
            <KIND_ICON.task size={16} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.75 pbs-0.25">
            <span className={cx(styles.title, shinyTextStyles.shinyText)}>
              {t('goalProcess.node.generating')}
            </span>
            <span className={cx(styles.ghostBar, 'w-[84%]')} />
            <span className={cx(styles.ghostBar, 'w-[56%]')} />
          </div>
        </div>
      </div>
    </div>
  );
});

GhostNodeView.displayName = 'GoalGraphGhostNodeView';

export default GraphNodeView;
