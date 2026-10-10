'use client';

import { Markdown } from '@lobehub/ui';
import { cn } from 'cn';
import { ChevronRight } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActivityTime } from '@/hooks/useActivityTime';

import type { GoalGraphView, GoalNodeView } from './goalGraphViewModel';
import { KindDot } from './shared';

/**
 * What the goal currently believes. Borderless rows — a finding is reading
 * material, not a control — and clicking one expands its evidence in place:
 * the question it answers and the task that produced it.
 */

const styles = {
  arrow:
    'flex-none text-[var(--ant-color-text-quaternary)] transition-[transform] duration-200 ease-[ease]',
  arrowOpen: '[transform:rotate(90deg)]',
  body: 'pt-0 pb-2.5 ps-7.5 pe-2',
  source: 'flex-none max-w-[40%] text-end',
  time: 'flex-none min-w-15 text-end',
  row: 'cursor-pointer p-2 rounded-(--ant-border-radius-sm) hover:bg-[var(--ant-color-fill-quaternary)]',
};

const FindingRow = memo<{ onSelect: (nodeId: string) => void; view: GoalNodeView }>(
  ({ onSelect, view }) => {
    const { t } = useTranslation('chat');
    const [open, setOpen] = useState(false);
    const { text, title } = useActivityTime(view.node.resolvedAt ?? view.node.createdAt);
    const answered = view.answers[0];

    return (
      <div className="flex flex-col gap-0">
        <div className={cn('flex items-center gap-2', styles.row)} onClick={() => setOpen(!open)}>
          <ChevronRight className={cn(styles.arrow, open && styles.arrowOpen)} size={14} />
          <KindDot kind={'finding'} />
          {/* The title takes the slack so the attribution and the timestamp
              line up as columns, matching the deliverables list directly
              above — otherwise the two adjacent sections read as different
              layouts of the same row. */}
          <div className="truncate min-w-0 font-medium" style={{ flex: 1, minWidth: 0 }}>
            {view.node.title}
          </div>
          <div className={cn('truncate min-w-0 text-[12px] text-muted-foreground', styles.source)}>
            {answered
              ? t('goalProcess.findings.answers', { title: answered.title })
              : view.producedBy
                ? t('goalProcess.findings.from', { title: view.producedBy.title })
                : ''}
          </div>
          <div className={cn('text-[12px] text-muted-foreground', styles.time)} title={title}>
            {text}
          </div>
        </div>
        {open && (
          <div className={cn('flex flex-col gap-2', styles.body)}>
            {view.answers.map((problem) => (
              <div
                className="flex items-center gap-1.5"
                key={problem.id}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect(problem.id)}
              >
                <KindDot kind={'problem'} />
                <div className="text-[12px] text-muted-foreground">
                  {t('goalProcess.findings.answers', { title: problem.title })}
                </div>
              </div>
            ))}
            {/* The description is the producing run's handoff — actual Markdown
                (tables, code blocks), not plain text. Render it as such. */}
            {view.node.description && (
              <Markdown fontSize={13} variant={'chat'}>
                {view.node.description}
              </Markdown>
            )}
            {view.producedBy && (
              <div
                className="flex items-center gap-1.5"
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect(view.producedBy!.id)}
              >
                <KindDot kind={'task'} />
                <div className="text-[12px] text-muted-foreground">
                  {t('goalProcess.findings.from', { title: view.producedBy.title })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
);

FindingRow.displayName = 'GoalFindingRow';

const Findings = memo<{ graph: GoalGraphView; onSelect: (nodeId: string) => void }>(
  ({ graph, onSelect }) => {
    const { t } = useTranslation('chat');
    const findings = [...graph.findings].sort(
      (a, b) =>
        (b.node.resolvedAt ?? b.node.createdAt).getTime() -
        (a.node.resolvedAt ?? a.node.createdAt).getTime(),
    );

    if (findings.length === 0)
      return (
        <div className="text-[13px] text-muted-foreground">{t('goalProcess.findings.empty')}</div>
      );

    return (
      <div className="flex flex-col gap-0">
        {findings.map((view) => (
          <FindingRow key={view.node.id} view={view} onSelect={onSelect} />
        ))}
      </div>
    );
  },
);

Findings.displayName = 'GoalFindings';

export default Findings;
