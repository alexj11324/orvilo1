'use client';

import type { AcceptanceStatus, GoalDecisionOption } from '@orvilo/types';
import { cn } from 'cn';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { createElement, Fragment, memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { TASK_STATUS_VISUALS } from '@/components/ExecutionStatus';
import { Badge } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { openAddGoalTaskModal } from '@/features/AgentGoals/AddTaskModal';
import RunIntegrationTag from '@/features/AgentTasks/AgentTaskDetail/RunIntegrationTag';
import RunningGlyph from '@/features/Home/components/RunningGlyph';
import { useActivityTime } from '@/hooks/useActivityTime';
import { useChatStore } from '@/store/chat';

import {
  coordinatorGateReason,
  coordinatorNodeTitleKey,
  coordinatorReasonCopy,
  viewGateKind,
} from './coordinatorCopy';
import type { FrontierItem, GoalGraphView, GoalNodeView } from './goalGraphViewModel';
import { useElapsed } from './useElapsed';

/**
 * 当前任务 — one row per thing that can change state now, in the AgentTaskItem
 * shape: `#n · glyph · title · state tag · … · actions`. Rows that need a human
 * open their whole case in place (why it stopped, what each option costs, the
 * attempt ledger) instead of truncating it onto the title line. Just-finished
 * tasks stay at the top, dimmed, so the list fades rather than items vanishing;
 * blocked ones fold at the bottom and reference blockers by the same numbers
 * the rows carry.
 */

const styles = {
  attempt: 'py-1.5 [&+&]:[border-block-start:1px_dashed_var(--sidebar-border)]',
  blockedHead:
    'cursor-pointer select-none flex gap-1.5 items-center py-2 px-3 text-[12px] text-[var(--ant-color-text-tertiary)] hover:text-muted-foreground',
  body: 'pt-2 pb-3.5 ps-6.5 pe-3',
  deps: 'font-mono text-[12px] text-[var(--ant-color-text-quaternary)]',
  dim: 'opacity-55 transition-opacity duration-150 ease-[ease] hover:opacity-100',
  label: 'text-[12px] text-muted-foreground',
  list: 'overflow-hidden border border-sidebar-border rounded-(--ant-border-radius) bg-card',
  mono: 'font-mono tabular-nums',
  num: 'flex-none min-w-5.5 font-mono text-[12px] text-[var(--ant-color-text-quaternary)]',
  option: 'grid grid-cols-[128px_1fr] gap-2 items-baseline',
};

export interface FrontierActions {
  addTask: (title: string, description?: string) => Promise<void>;
  decide: (decisionId: string, optionId: string, resolution?: string) => void;
}

interface FrontierProps {
  actions: FrontierActions;
  canEdit: boolean;
  graph: GoalGraphView;
  onSelect: (nodeId: string) => void;
  /** The coordinator is still decomposing — the empty list is a promise, not a lull. */
  planning?: boolean;
}

/** Server option ids are stable; their labels are English strings from the coordinator. */
const useOptionLabel = () => {
  const { t } = useTranslation('chat');
  return (option: GoalDecisionOption) => {
    switch (option.id) {
      case 'fail': {
        return t('goalProcess.gate.option.fail');
      }
      case 'retire': {
        return t('goalProcess.gate.option.retire');
      }
      case 'retry': {
        return t('goalProcess.gate.option.retry');
      }
      default: {
        return option.label;
      }
    }
  };
};

const RowGlyph = memo<{ kind: FrontierItem['kind']; view: GoalNodeView }>(({ kind, view }) => {
  switch (kind) {
    case 'done': {
      const visual =
        view.node.status === 'resolved'
          ? TASK_STATUS_VISUALS.completed
          : TASK_STATUS_VISUALS.canceled;
      return <visual.icon color={visual.color} size={16} />;
    }
    case 'gate': {
      return <TASK_STATUS_VISUALS.paused.icon color={TASK_STATUS_VISUALS.paused.color} size={16} />;
    }
    case 'running': {
      return <RunningGlyph size={16} />;
    }
    case 'stale': {
      return <TASK_STATUS_VISUALS.failed.icon color={TASK_STATUS_VISUALS.failed.color} size={16} />;
    }
    default: {
      return (
        <TASK_STATUS_VISUALS.backlog.icon color={TASK_STATUS_VISUALS.backlog.color} size={16} />
      );
    }
  }
});

RowGlyph.displayName = 'GoalFrontierRowGlyph';

const AttemptReason = memo<{ reason?: string | null }>(({ reason }) => {
  const { t } = useTranslation('chat');
  const copy = coordinatorReasonCopy(reason);
  return (
    <div
      className="truncate min-w-0 text-[12px] text-muted-foreground"
      style={{ flex: 1, minWidth: 0 }}
    >
      {copy ? t(copy.key as any, copy.params) : (reason ?? '')}
    </div>
  );
});

AttemptReason.displayName = 'GoalAttemptReason';

const AttemptLedger = memo<{ view: GoalNodeView }>(({ view }) => {
  const { t } = useTranslation('chat');
  if (view.attempts.length === 0) return null;

  return (
    <div className="flex flex-col gap-0">
      <span className={styles.label}>{t('goalProcess.attempts.title')}</span>
      {view.attempts.map((attempt) => (
        <div className={cn('flex items-baseline gap-2.5', styles.attempt)} key={attempt.index}>
          <div
            className={cn('text-[12px] text-muted-foreground', styles.mono)}
            style={{ flex: 'none', width: 60 }}
          >
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
          <AttemptReason reason={attempt.reason} />
        </div>
      ))}
    </div>
  );
});

AttemptLedger.displayName = 'GoalAttemptLedger';

/** The running clock lives in its own component so the 1s tick never re-renders the list. */
const RunningClock = memo<{ startedAt?: Date }>(({ startedAt }) => {
  const elapsed = useElapsed(startedAt);
  if (!elapsed) return null;
  return <div className={cn('text-[12px] text-muted-foreground', styles.mono)}>{elapsed}</div>;
});

RunningClock.displayName = 'GoalRunningClock';

const DoneTime = memo<{ view: GoalNodeView }>(({ view }) => {
  const { text, title } = useActivityTime(view.node.resolvedAt ?? view.node.updatedAt);
  return (
    <div className={cn('text-[12px] text-muted-foreground', styles.mono)} title={title}>
      {text || '—'}
    </div>
  );
});

DoneTime.displayName = 'GoalDoneTime';

const StaleBody = memo<{ view: GoalNodeView }>(({ view }) => {
  const { t } = useTranslation('chat');
  const { text } = useActivityTime(view.heartbeatAt);
  return (
    <div className="text-[13px] text-muted-foreground">
      {t('goalProcess.stale.description', { duration: text })}
    </div>
  );
});

StaleBody.displayName = 'GoalStaleBody';

/**
 * Whether this task's own delivery held up.
 *
 * Only the statuses a reader would act on: a settled judgment, a rejection, a
 * delivery waiting on them, or a verification that broke. `pending` / `planned`
 * say nothing yet, and `verifying` / `repairing` are already what the row's own
 * state chip says — repeating either would cost the row its scannability for no
 * information.
 *
 * `verifying` / `repairing` are in the map even though the row's own state chip
 * already names them: that chip is a label, and while the judgment is running is
 * exactly when a reader wants to look INTO it. Leaving them out meant the one
 * state where the acceptance matters most offered no way to reach it.
 */
const ACCEPTANCE_CHIP: Partial<Record<AcceptanceStatus, { color: string; key: string }>> = {
  accepted: { color: 'success', key: 'accepted' },
  delivered: { color: 'info', key: 'delivered' },
  errored: { color: 'error', key: 'errored' },
  rejected: { color: 'error', key: 'rejected' },
  repairing: { color: 'info', key: 'repairing' },
  verifying: { color: 'info', key: 'verifying' },
};

const AcceptanceChip = memo<{ view: GoalNodeView }>(({ view }) => {
  const { t } = useTranslation('chat');
  const openAcceptance = useChatStore((s) => s.openAcceptance);
  const acceptance = view.acceptance;
  const chip = acceptance ? ACCEPTANCE_CHIP[acceptance.status] : undefined;
  if (!acceptance || !chip) return null;

  return (
    <Badge
      size="sm"
      style={{ cursor: 'pointer' }}
      variant={chip.color === 'error' ? 'destructive' : (chip.color as 'info' | 'success')}
      // The evidence is the point: the chip is the way into it, opened in the
      // side Portal like every other drill-down on this page.
      onClick={(event) => {
        event.stopPropagation();
        openAcceptance(acceptance.id);
      }}
    >
      {t(`goalProcess.acceptance.${chip.key}` as any)}
    </Badge>
  );
});

AcceptanceChip.displayName = 'GoalAcceptanceChip';

const FrontierRow = memo<{
  actions: FrontierActions;
  canEdit: boolean;
  item: FrontierItem;
  numbers: Map<string, number>;
  onSelect: (nodeId: string) => void;
  /** A gate's ledger is the ledger of the Task it was opened for. */
  subject?: GoalNodeView;
}>(({ actions, canEdit, item, numbers, onSelect, subject }) => {
  const { t } = useTranslation('chat');
  const optionLabel = useOptionLabel();
  const [note, setNote] = useState('');
  const { view } = item;
  const { node } = view;
  const deps = view.dependsOn.map((id) => numbers.get(id)).filter(Boolean);

  // Coordinator-authored gates carry English strings; recognized shapes render
  // in the user's language, arbitrary gates keep their stored copy.
  const coordinatorTitleKey = coordinatorNodeTitleKey(view);
  const gateKind = item.kind === 'gate' ? viewGateKind(view) : undefined;
  const rawGateReason = gateKind ? coordinatorGateReason(view.decision?.question) : undefined;
  const gateReasonCopy = coordinatorReasonCopy(rawGateReason);
  const gateReasonText = gateReasonCopy
    ? t(gateReasonCopy.key as any, gateReasonCopy.params)
    : rawGateReason;

  // Gate rows carry no tag: the expanded card with its action buttons already
  // says "this needs you", and a warning chip next to it is noise.
  // While verifying, the acceptance chip carries the same word AND opens the
  // judgment, so a second inert label beside it would only take space.
  const verifyingChipShown =
    item.kind === 'verifying' && !!view.acceptance && !!ACCEPTANCE_CHIP[view.acceptance.status];
  const tag =
    item.kind === 'verifying'
      ? verifyingChipShown
        ? null
        : { color: 'info', text: t('goalProcess.tag.verifying') }
      : item.kind === 'stale'
        ? { color: 'error', text: t('goalProcess.tag.lost') }
        : item.kind === 'done'
          ? {
              color: undefined,
              text:
                node.status === 'resolved'
                  ? t('goalProcess.tag.done')
                  : t('goalProcess.tag.retired'),
            }
          : null;

  const stop = (event: React.MouseEvent) => event.stopPropagation();

  return (
    <div
      className={cn('flex flex-col p-3', item.kind === 'done' ? styles.dim : undefined)}
      style={{ cursor: 'pointer' }}
      onClick={() => onSelect(node.id)}
    >
      <div className="flex items-center gap-2.5">
        {view.seq !== undefined && <span className={styles.num}>#{view.seq}</span>}
        <RowGlyph kind={item.kind} view={view} />
        <div
          className="truncate min-w-0 font-medium"
          style={{ flexShrink: 1, maxWidth: '60%', minWidth: 0 }}
        >
          {coordinatorTitleKey ? t(coordinatorTitleKey as any) : node.title}
        </div>
        {tag && (
          <Badge
            size="sm"
            variant={
              tag.color === 'error' ? 'destructive' : tag.color === 'info' ? 'info' : 'secondary'
            }
          >
            {tag.text}
          </Badge>
        )}
        {deps.length > 0 && (
          <span className={styles.deps}>
            {t('goalProcess.frontier.dependsOn', { refs: deps.map((d) => `#${d}`).join(' ') })}
          </span>
        )}
        <div className="flex flex-col flex-1" />
        <div className="flex items-center gap-2" style={{ flex: 'none' }}>
          <AcceptanceChip view={view} />
          {/* Delivery is not done when the child is: the run's branch still has
              to land. Same chip as the task detail — state, evidence tooltip,
              and the retry/PR entry points ride along. */}
          {view.integration && (
            <RunIntegrationTag
              integration={view.integration}
              taskId={node.taskId ?? undefined}
              topicId={view.integration.topicId}
            />
          )}
          {item.kind === 'running' && <RunningClock startedAt={view.startedAt} />}
          {item.kind === 'done' && <DoneTime view={view} />}
        </div>
      </div>

      {item.rank === 0 && (
        // The expanded body is READ-ONLY content — why it stopped and what each
        // attempt did — so it must stay part of the row's click target. It used
        // to stop propagation wholesale for the gate form's sake, which made a
        // lost/gate row unopenable in practice: the body is most of the row's
        // height, so a click aimed anywhere natural landed in dead space while
        // the pointer cursor still promised otherwise. Only the form below opts
        // out.
        <div className={cn('flex flex-col gap-3.5', styles.body)}>
          {item.kind === 'gate' && view.decision && (
            // State the problem itself, in the user's language when the
            // coordinator's vocabulary is recognized — the buttons below
            // already carry the choices, so no extra framing sentence.
            <div className="text-[13px] font-medium">
              {gateReasonText ?? view.decision.question}
            </div>
          )}
          {item.kind === 'stale' && <StaleBody view={view} />}
          <AttemptLedger view={subject ?? view} />
          {item.kind === 'gate' && canEdit && (
            // A click here is aimed at the note field or a decision button —
            // never at "open this node".
            <div className="flex flex-col gap-3.5" onClick={stop}>
              <div className="flex flex-col gap-1">
                <span className={styles.label}>{t('goalProcess.gate.noteLabel')}</span>
                <Textarea
                  placeholder={t('goalProcess.gate.notePlaceholder')}
                  rows={1}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
              {/* Actions close the card: read the situation, add guidance, then decide. */}
              <div className="flex gap-2">
                {view.decision?.options?.map((option) => (
                  <TooltipProvider key={option.id}>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span style={{ display: 'inline-flex' }}>
                            <Button
                              variant={
                                option.id === view.decision?.recommendedOptionId
                                  ? 'default'
                                  : 'outline'
                              }
                              onClick={(event) => {
                                stop(event);
                                actions.decide(
                                  view.decision!.id,
                                  option.id,
                                  note.trim() || undefined,
                                );
                              }}
                            >
                              {optionLabel(option)}
                            </Button>
                          </span>
                        }
                      />
                      <TooltipContent>{option.description}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

FrontierRow.displayName = 'GoalFrontierRow';

/** Opening a modal keeps the frontier header quiet — the brief gets a real form. */
const AddTaskButton = memo<{ onAdd: FrontierActions['addTask'] }>(({ onAdd }) => {
  const { t } = useTranslation('chat');
  return (
    <Button size="sm" variant="ghost" onClick={() => openAddGoalTaskModal({ onAdd })}>
      <Plus />
      {t('goalProcess.frontier.add')}
    </Button>
  );
});

AddTaskButton.displayName = 'GoalAddTaskButton';

const Frontier = memo<FrontierProps>(({ actions, canEdit, graph, onSelect, planning }) => {
  const { t } = useTranslation('chat');
  const [showBlocked, setShowBlocked] = useState(false);

  const numbers = new Map(
    graph.nodes.filter((view) => view.seq !== undefined).map((view) => [view.node.id, view.seq!]),
  );
  const achieved = graph.goal.status === 'achieved';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <div className="text-[16px] font-semibold">{t('goalProcess.frontier.title')}</div>
          {graph.frontier.length > 0 && (
            <div className="text-[12px] text-muted-foreground">
              {graph.needsYou > 0
                ? `${t('goalProcess.frontier.needsYou', { count: graph.needsYou })} · `
                : ''}
              {t('goalProcess.frontier.advanceable', { count: graph.advanceable })}
            </div>
          )}
        </div>
        {canEdit && <AddTaskButton onAdd={actions.addTask} />}
      </div>

      <div className={styles.list}>
        <div className="flex flex-col gap-0 p-0.5">
          {graph.frontier.length === 0 &&
            (planning ? (
              <div className="flex items-center gap-2.5 p-3">
                <RunningGlyph size={16} />
                <div className="flex flex-col gap-0.5">
                  <div className="font-medium">{t('goalProcess.planning.title')}</div>
                  <div className="text-[12px] text-muted-foreground">
                    {t('goalProcess.planning.description')}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-0.5 p-3">
                <div className="font-medium">
                  {achieved
                    ? t('goalProcess.frontier.achievedTitle')
                    : t('goalProcess.frontier.emptyTitle')}
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {achieved
                    ? t('goalProcess.frontier.achievedDescription')
                    : t('goalProcess.frontier.emptyDescription')}
                </div>
              </div>
            ))}
          {graph.frontier.map((item, index) => (
            <Fragment key={item.key}>
              {index > 0 && (
                <Separator
                  className="bg-transparent border-t border-dashed border-border"
                  style={{ margin: 0 }}
                />
              )}
              <FrontierRow
                actions={actions}
                canEdit={canEdit}
                item={item}
                numbers={numbers}
                subject={item.view.gateSubjectId ? graph.byId[item.view.gateSubjectId] : undefined}
                onSelect={onSelect}
              />
            </Fragment>
          ))}
        </div>
        {graph.blocked.length > 0 && (
          <>
            <Separator
              className="bg-transparent border-t border-dashed border-border"
              style={{ margin: 0 }}
            />
            <div className={styles.blockedHead} onClick={() => setShowBlocked(!showBlocked)}>
              {createElement(showBlocked ? ChevronDown : ChevronRight, { size: 12 })}
              <span>{t('goalProcess.frontier.blocked', { count: graph.blocked.length })}</span>
            </div>
            {showBlocked && (
              <div className="flex flex-col gap-0 p-0.5">
                {graph.blocked.map((view, index) => (
                  <Fragment key={view.node.id}>
                    {index > 0 && (
                      <Separator
                        className="bg-transparent border-t border-dashed border-border"
                        style={{ margin: 0 }}
                      />
                    )}
                    <FrontierRow
                      actions={actions}
                      canEdit={canEdit}
                      item={{ key: view.node.id, kind: 'ready', rank: 3, view }}
                      numbers={numbers}
                      onSelect={onSelect}
                    />
                  </Fragment>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});

Frontier.displayName = 'GoalFrontier';

export default Frontier;
