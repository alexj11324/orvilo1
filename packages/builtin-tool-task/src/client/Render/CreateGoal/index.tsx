'use client';

import type { GoalStatus } from '@orvilo/const/goal';
import type { BuiltinRenderProps } from '@orvilo/types';
import type { TFunction } from 'i18next';
import {
  AlertTriangle,
  CheckCheck,
  CircleSlash,
  CircleX,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Stamp,
  Target,
} from 'lucide-react';
import { createElement, memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { goalSelectors, useGoalStore } from '@/store/goal';

import type { CreateGoalParams, CreateGoalState } from '../../../types';
import { TaskResultCard } from '../shared';

const formatElapsed = (milliseconds: number) => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
};

/**
 * How the goal's live state reads on the conversation card.
 *
 * `settled` marks the states where the loop has stopped moving on its own —
 * they stop the timer and the spinner, and the row becomes a way into the
 * acceptance, because from here the next move is the user's.
 */
const PHASE_META = {
  accepted: { color: 'var(--success)', icon: CheckCheck, settled: true },
  awaitingDecision: { color: 'var(--destructive)', icon: AlertTriangle, settled: true },
  awaitingReview: { color: 'var(--warning)', icon: Stamp, settled: true },
  closed: { color: 'var(--ant-color-text-tertiary)', icon: CircleSlash, settled: true },
  errored: { color: 'var(--destructive)', icon: CircleX, settled: true },
  rejected: { color: 'var(--destructive)', icon: RotateCcw, settled: false },
  repairing: { color: 'var(--warning)', icon: RefreshCw, settled: false },
  running: { color: 'var(--info)', icon: LoaderCircle, settled: false },
  verifying: { color: 'var(--info)', icon: LoaderCircle, settled: false },
} as const;

type PhaseKey = keyof typeof PHASE_META;

/** Literal keys, so a renamed or missing phase label fails type-check. */
const phaseLabel = (t: TFunction<'plugin'>, phase: PhaseKey): string => {
  switch (phase) {
    case 'accepted': {
      return t('builtins.orvilo-task.goal.phase.accepted');
    }
    case 'awaitingDecision': {
      return t('builtins.orvilo-task.goal.phase.awaitingDecision');
    }
    case 'awaitingReview': {
      return t('builtins.orvilo-task.goal.phase.awaitingReview');
    }
    case 'closed': {
      return t('builtins.orvilo-task.goal.phase.closed');
    }
    case 'errored': {
      return t('builtins.orvilo-task.goal.phase.errored');
    }
    case 'rejected': {
      return t('builtins.orvilo-task.goal.phase.rejected');
    }
    case 'repairing': {
      return t('builtins.orvilo-task.goal.phase.repairing');
    }
    case 'verifying': {
      return t('builtins.orvilo-task.goal.phase.verifying');
    }
    case 'running': {
      return t('builtins.orvilo-task.goal.running');
    }
  }
};

/**
 * The card reads the goal's own lifecycle state instead of waiting for the
 * coordinator to push a phase onto this tool message. A push can silently never
 * arrive (it needs the task to remember which tool call spawned it); the goal
 * row is the same record the goal page reads, so the conversation can never
 * disagree with it.
 */
const resolvePhase = (status: GoalStatus | undefined, pendingDecisions: number): PhaseKey => {
  if (pendingDecisions > 0) return 'awaitingDecision';
  switch (status) {
    case 'achieved': {
      return 'accepted';
    }
    case 'canceled': {
      return 'closed';
    }
    case 'failed': {
      return 'errored';
    }
    // Paused means the coordinator stopped scheduling: either the user paused
    // it, or a budget ran out. Either way the next move is theirs.
    case 'paused': {
      return 'awaitingDecision';
    }
    case 'review': {
      return 'awaitingReview';
    }
    case 'verifying': {
      return 'verifying';
    }
    default: {
      return 'running';
    }
  }
};

const CreateGoalRender = memo<BuiltinRenderProps<CreateGoalParams, CreateGoalState>>(
  ({ args, pluginState }) => {
    const { t } = useTranslation('plugin');
    const navigate = useWorkspaceAwareNavigate();
    const goalId = pluginState?.goalId;
    const [now, setNow] = useState(() => Date.now());

    const useFetchGoalGraph = useGoalStore((s) => s.useFetchGoalGraph);
    useFetchGoalGraph(goalId);
    const snapshot = useGoalStore(goalSelectors.goalGraph(goalId));
    const pendingDecisions =
      snapshot?.decisions.filter((decision) => decision.status === 'pending').length ?? 0;
    const phase = resolvePhase(snapshot?.goal.status, pendingDecisions);
    const meta = PHASE_META[phase];

    // Ticks the elapsed clock only. Refreshing the graph is `useFetchGoalGraph`'s
    // job and it already polls while the goal is one the server can move — doing
    // it here too meant every mounted card pulled the whole snapshot once a
    // second, and a card whose fetch had failed read as unsettled and never
    // stopped asking.
    useEffect(() => {
      if (meta.settled) return;
      const timer = window.setInterval(() => setNow(Date.now()), 1000);
      return () => window.clearInterval(timer);
    }, [meta.settled]);

    if (!pluginState?.success || !goalId) return null;

    const agentId = snapshot?.goal.agentId;
    const openGoal = agentId ? () => navigate(`/agent/${agentId}/goal/${goalId}`) : undefined;

    return (
      <TaskResultCard
        icon={Target}
        iconColor={'var(--muted-foreground)'}
        title={snapshot?.goal.title ?? pluginState.name ?? args?.name}
      >
        <div
          className="flex items-center gap-2"
          style={{ ...(openGoal ? { cursor: 'pointer' } : undefined) }}
          onClick={openGoal}
        >
          {createElement(meta.icon, {
            className:
              phase === 'running' || phase === 'verifying' || phase === 'repairing'
                ? 'animate-spin'
                : undefined,
            size: 15,
            style: { color: meta.color },
          })}
          <div className="flex flex-col flex-1 gap-[2px]">
            <div className="flex items-center justify-between">
              <div className="text-[13px]">{phaseLabel(t, phase)}</div>
              {!meta.settled && (
                <div className="font-mono rounded bg-muted px-1 text-[12px] text-muted-foreground">
                  {formatElapsed(now - new Date(pluginState.startedAt ?? Date.now()).getTime())}
                </div>
              )}
            </div>
            <div className="text-[12px] text-muted-foreground">
              {meta.settled
                ? t('builtins.orvilo-task.goal.settledHint')
                : t('builtins.orvilo-task.goal.runningHint', {
                    count: args?.criteria?.length ?? 0,
                  })}
            </div>
          </div>
        </div>
      </TaskResultCard>
    );
  },
);

CreateGoalRender.displayName = 'CreateGoalRender';

export default CreateGoalRender;
