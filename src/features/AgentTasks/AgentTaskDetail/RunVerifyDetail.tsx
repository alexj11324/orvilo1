'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { Check, ChevronDown, ChevronRight, CircleDashed, X } from 'lucide-react';
import { memo, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useVerifyResults } from '@/features/Acceptance';

const styles = createStaticStyles(({ css }) => ({
  check: css`
    padding-block: 6px;
    padding-inline: 10px;

    & + & {
      border-block-start: 1px solid ${cssVar.colorBorderSecondary};
    }
  `,
  header: css`
    justify-content: flex-start;

    width: 100%;
    height: auto;
    margin: -4px;
    padding: 4px;
    border-radius: ${cssVar.borderRadius};

    text-align: start;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  list: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
  `,
  reason: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
}));

const verdictIcon = (verdict: string | null) => {
  if (verdict === 'passed') return { color: cssVar.colorSuccess, icon: Check };
  if (verdict) return { color: cssVar.colorError, icon: X };
  return { color: cssVar.colorTextQuaternary, icon: CircleDashed };
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
        title={t(expanded ? 'taskDetail.runCollapse' : 'taskDetail.runExpand')}
        variant="ghost"
        onClick={() => setExpanded((open) => !open)}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown color={cssVar.colorTextQuaternary} size={12} />
          ) : (
            <ChevronRight color={cssVar.colorTextQuaternary} size={12} />
          )}
          <div className="text-[12px] text-muted-foreground">
            {t('taskDetail.runVerify.checklist')}
          </div>
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
                  <meta.icon color={meta.color} size={14} style={{ flex: 'none' }} />
                  <div className="truncate block text-sm" style={{ flex: 1, minWidth: 0 }}>
                    {result.checkItemTitle}
                  </div>
                </div>
                {reasoning && (
                  <div className={cn(styles.reason)} style={{ whiteSpace: 'pre-wrap' }}>
                    {reasoning}
                  </div>
                )}
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
