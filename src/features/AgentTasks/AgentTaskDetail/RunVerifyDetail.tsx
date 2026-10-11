'use client';

import { cn } from 'cn';
import { Check, ChevronDown, ChevronRight, CircleDashed, X } from 'lucide-react';
import { memo, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useVerifyResults } from '@/features/Acceptance';

const styles = {
  check: 'py-1.5 px-2.5 [&+&]:border-bs [&+&]:border-divider',
  header: 'justify-start w-full -m-1 p-1 text-start hover:bg-accent',
  list: 'overflow-hidden border border-divider rounded-(--radius-card)',
  reason: 'text-xs leading-5 text-muted-foreground whitespace-pre-wrap',
};

const verdictIcon = (verdict: string | null) => {
  if (verdict === 'passed') return { className: 'text-success-text', icon: Check };
  if (verdict) return { className: 'text-destructive-text', icon: X };
  return { className: 'text-foreground-quaternary', icon: CircleDashed };
};

/**
 * The per-check breakdown behind a run's verdict, fetched only once the run is
 * expanded — a collapsed feed of many rounds should not pull every round's
 * results just to show a tag.
 */
const RunVerifyDetail = memo<{
  /** The run's verdict tag, which follows the list once it is open. */
  extra?: ReactNode;
  operationId?: string | null;
}>(({ extra, operationId }) => {
  const { t } = useTranslation('chat');
  const { data: results } = useVerifyResults(operationId ?? null);
  const [expanded, setExpanded] = useState(true);

  if (!results?.length) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        aria-expanded={expanded}
        className={cn(styles.header)}
        size="compact"
        title={t(expanded ? 'taskDetail.runCollapse' : 'taskDetail.runExpand')}
        variant="ghost"
        onClick={() => setExpanded((open) => !open)}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="size-3 text-foreground-quaternary" size={12} />
          ) : (
            <ChevronRight className="size-3 text-foreground-quaternary" size={12} />
          )}
          <div className="text-xs text-muted-foreground">{t('taskDetail.runVerify.checklist')}</div>
          {extra}
        </div>
      </Button>
      {expanded && (
        <div className={`flex flex-col ${styles.list}`}>
          {results.map((result) => {
            const meta = verdictIcon(result.verdict);
            // An LLM judge's reasoning IS its product; a programmatic check
            // usually has none, and then the verdict alone is the whole story.
            const reasoning = (result.toulmin as { reasoning?: string } | null)?.reasoning;

            return (
              <div className={`flex flex-col gap-1 ${styles.check}`} key={result.id}>
                <div className="flex items-center gap-2">
                  <meta.icon className={cn('flex-none size-3.5', meta.className)} size={14} />
                  <div className="truncate block flex-1 min-w-0 text-sm leading-5.5">
                    {result.checkItemTitle}
                  </div>
                </div>
                {reasoning && <div className={cn(styles.reason)}>{reasoning}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

RunVerifyDetail.displayName = 'RunVerifyDetail';

export default RunVerifyDetail;
