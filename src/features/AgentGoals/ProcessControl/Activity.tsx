'use client';

import { cn } from 'cn';
import { BotMessageSquare, ChevronRight } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { useActivityTime } from '@/hooks/useActivityTime';

import { coordinatorNodeTitleKey } from './coordinatorCopy';
import type { GoalGraphView, GoalNodeView } from './goalGraphViewModel';
import { KindDot } from './shared';
import { useElapsed } from './useElapsed';

/**
 * 活动 — one row per node, not a raw event dump.
 *
 * A goal produces many runtime events (dispatch, evidence submission, verifier
 * verdicts, lease renewals). Most of them belong *inside* a task: the verifier
 * judging attempt #2 is part of that task's story, not a separate line in the
 * goal's history. So each row is "what this task did, how it ended", with the
 * per-attempt ledger folded underneath.
 */

const styles = {
  arrow:
    'flex-none text-[var(--ant-color-text-quaternary)] transition-[transform] duration-200 ease-[ease]',
  arrowOpen: '[transform:rotate(90deg)]',
  attempt: 'py-1.5 [&+&]:[border-block-start:1px_dashed_var(--sidebar-border)]',
  body: 'pt-0 pb-2.5 ps-10.5 pe-2.25',
  mono: 'font-mono tabular-nums',
  row: 'cursor-pointer py-1.5 px-2.25 rounded-(--ant-border-radius-sm) hover:bg-[var(--ant-color-fill-quaternary)]',
  time: 'flex-none ms-auto',
};

const lastTouch = (view: GoalNodeView): Date =>
  [
    view.node.resolvedAt,
    view.node.updatedAt,
    view.attempts.at(-1)?.endedAt,
    view.attempts.at(-1)?.startedAt,
  ]
    .filter((date): date is Date => !!date)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? view.node.createdAt;

const useSummary = () => {
  const { t } = useTranslation('chat');
  return (view: GoalNodeView): string => {
    const { node } = view;
    const count = view.attempts.length;
    if (node.kind === 'decision')
      return node.status === 'waiting'
        ? t('goalProcess.summary.gateOpen')
        : t('goalProcess.summary.gateResolved', {
            option: view.humanTouches[0]?.resolvedOptionId ?? '—',
          });
    switch (node.status) {
      case 'active': {
        return t('goalProcess.summary.running', { index: count });
      }
      case 'rejected':
      case 'retired': {
        return t('goalProcess.summary.retired', { count });
      }
      case 'resolved': {
        return t('goalProcess.summary.done', { count });
      }
      case 'waiting': {
        return t('goalProcess.summary.waiting', { count });
      }
      default: {
        return t('goalProcess.summary.notStarted');
      }
    }
  };
};

const RunningClock = memo<{ startedAt?: Date }>(({ startedAt }) => {
  const { t } = useTranslation('chat');
  const elapsed = useElapsed(startedAt);
  if (!elapsed) return null;
  return (
    <div className={cn('text-[12px] text-muted-foreground', styles.mono)} style={{ flex: 'none' }}>
      {t('goalProcess.running.elapsed', { duration: elapsed })}
    </div>
  );
});

RunningClock.displayName = 'GoalActivityRunningClock';

const ActivityRow = memo<{ onSelect: (nodeId: string) => void; view: GoalNodeView }>(
  ({ onSelect, view }) => {
    const { t } = useTranslation('chat');
    const summarize = useSummary();
    const [open, setOpen] = useState(false);
    const { text, title } = useActivityTime(lastTouch(view));
    const hasDetail = view.attempts.length > 0 || view.findings.length > 0;
    const coordinatorTitleKey = coordinatorNodeTitleKey(view);

    return (
      <div className="flex flex-col gap-0">
        <div
          className={`flex items-center gap-2 ${styles.row}`}
          onClick={() => (hasDetail ? setOpen(!open) : onSelect(view.node.id))}
        >
          <ChevronRight
            className={cn(styles.arrow, open && styles.arrowOpen)}
            size={14}
            style={{ opacity: hasDetail ? 1 : 0 }}
          />
          <KindDot kind={view.node.kind} />
          <div className="truncate min-w-0 font-medium" style={{ flexShrink: 1, minWidth: 0 }}>
            {coordinatorTitleKey ? t(coordinatorTitleKey as any) : view.node.title}
          </div>
          <div
            className="truncate min-w-0 text-[14px] text-muted-foreground"
            style={{ flexShrink: 1, minWidth: 0 }}
          >
            {summarize(view)}
          </div>
          {view.startedAt && <RunningClock startedAt={view.startedAt} />}
          <div
            className={cn('text-[12px] text-muted-foreground', cn(styles.time, styles.mono))}
            title={title}
          >
            {text}
          </div>
        </div>
        {open && (
          <div className={`flex flex-col gap-2.5 ${styles.body}`}>
            {view.attempts.length > 0 && (
              <div className="flex flex-col gap-0">
                {view.attempts.map((attempt) => (
                  <div className={`flex flex-col gap-0.5 ${styles.attempt}`} key={attempt.index}>
                    <div className="flex items-center gap-2">
                      <div className="text-[12px] font-semibold" style={{ flex: 'none' }}>
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
                    </div>
                    {attempt.reason && (
                      <div className="text-[12px] text-muted-foreground">{attempt.reason}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {view.findings.map((finding) => (
              <div
                className="flex items-center gap-1.5"
                key={finding.id}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect(finding.id)}
              >
                <KindDot kind={'finding'} />
                <div className="text-[13px]">
                  {t('goalProcess.activity.finding', { title: finding.title })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
);

ActivityRow.displayName = 'GoalActivityRow';

const Activity = memo<{ graph: GoalGraphView; onSelect: (nodeId: string) => void }>(
  ({ graph, onSelect }) => {
    const { t } = useTranslation('chat');
    const rows = graph.nodes
      .filter(
        (view) =>
          (view.node.kind === 'task' &&
            (view.attempts.length > 0 || view.node.status !== 'proposed')) ||
          (view.node.kind === 'decision' && view.node.status !== 'proposed'),
      )
      .sort((a, b) => lastTouch(b).getTime() - lastTouch(a).getTime());

    if (rows.length === 0)
      return (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant={'icon'}>
              <BotMessageSquare />
            </EmptyMedia>
            <EmptyDescription>{t('goalProcess.activity.empty')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );

    return (
      <div className="flex flex-col gap-0.5">
        {rows.map((view) => (
          <ActivityRow key={view.node.id} view={view} onSelect={onSelect} />
        ))}
      </div>
    );
  },
);

Activity.displayName = 'GoalActivity';

export default Activity;
