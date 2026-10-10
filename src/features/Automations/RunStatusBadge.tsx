import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { normalizeRunStatus } from './shared';

const RUN_STYLE: Record<string, { background: string; color: string }> = {
  completed: { background: 'var(--ant-color-success-bg)', color: 'var(--success)' },
  failed: { background: 'var(--ant-color-error-bg)', color: 'var(--destructive)' },
  running: { background: 'var(--ant-color-info-bg)', color: 'var(--info)' },
  skipped: { background: 'var(--accent)', color: 'var(--muted-foreground)' },
};

interface RunStatusBadgeProps {
  /** Detail under the badge (e.g. failure reason) appended in secondary text. */
  hint?: string | null;
  /** Raw task_topics status string — normalized inside. */
  status?: string | null;
}

const RunStatusBadge = memo<RunStatusBadgeProps>(({ hint, status }) => {
  const { t } = useTranslation('automation');
  const normalized = normalizeRunStatus(status);
  const style = RUN_STYLE[normalized];
  return (
    <span
      title={hint ?? undefined}
      style={{
        alignItems: 'center',
        background: style.background,
        borderRadius: 6,
        color: style.color,
        display: 'inline-flex',
        fontSize: 12,
        gap: 4,
        lineHeight: 1.6,
        maxWidth: 280,
        paddingBlock: 1,
        paddingInline: 8,
      }}
    >
      <div className="truncate min-w-0 text-[12px]" style={{ color: 'inherit' }}>
        {t(`run_status.${normalized}`)}
        {hint ? ` · ${hint}` : ''}
      </div>
    </span>
  );
});

export default RunStatusBadge;
