import { cn } from 'cn';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import { runEndingFallbackKey, splitFailureReason } from './runEnding';

interface RunFailureReasonProps {
  className?: string;
  /** Reason the runtime recorded. Untrusted: rendered as a text node only. */
  reason?: string | null;
  /** Run status, for the fixed sentence used when no reason was recorded. */
  status?: string | null;
}

/**
 * Why a run failed, timed out or was stopped. The reason is agent/CLI output,
 * so it goes into the DOM as plain text — never through Markdown or HTML — and
 * a long one is cut to a preview with the rest behind "Show full reason".
 */
const RunFailureReason = memo<RunFailureReasonProps>(({ className, reason, status }) => {
  const { t } = useTranslation('chat');
  const [expanded, setExpanded] = useState(false);
  const text = splitFailureReason(reason);

  if (!text) {
    const fallbackKey = runEndingFallbackKey(status);
    if (!fallbackKey) return null;
    return (
      <p className={cn('text-xs leading-5 text-muted-foreground', className)}>
        {String(t(fallbackKey as never))}
      </p>
    );
  }

  return (
    <div
      className={cn('flex min-w-0 max-w-full flex-col items-start gap-1', className)}
      data-testid="run-failure-reason"
    >
      <p className="max-w-full text-xs leading-5 break-words whitespace-pre-wrap text-destructive-text">
        {expanded ? text.full : text.preview}
      </p>
      {text.truncated && (
        <Button
          aria-expanded={expanded}
          size="xs"
          variant="ghost"
          onClick={() => setExpanded((open) => !open)}
        >
          {t(expanded ? 'taskDetail.runEnded.showLess' : 'taskDetail.runEnded.showFull')}
        </Button>
      )}
    </div>
  );
});

RunFailureReason.displayName = 'RunFailureReason';

export default RunFailureReason;
