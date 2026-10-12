import { CircleAlert } from 'lucide-react';
import { memo } from 'react';

import { EXECUTION_STATUS_VISUALS, type ExecutionStatusVisual } from '@/components/ExecutionStatus';

type TopicRunStatus = 'canceled' | 'completed' | 'failed' | 'pending' | 'running' | 'timeout';

const STATIC_META: Record<Exclude<TopicRunStatus, 'running'>, ExecutionStatusVisual> = {
  canceled: EXECUTION_STATUS_VISUALS.canceled,
  completed: EXECUTION_STATUS_VISUALS.completed,
  failed: EXECUTION_STATUS_VISUALS.failed,
  // Not-yet-started run: same glyph as a backlog task.
  pending: EXECUTION_STATUS_VISUALS.backlog,
  timeout: { color: 'var(--ant-color-warning)', icon: CircleAlert },
};

const RunningIcon = memo<{ size: number }>(({ size }) => {
  const mainColor = 'var(--ant-color-warning)';
  const ringColor = `color-mix(in srgb, ${'var(--ant-color-warning)'} 35%, transparent)`;
  return (
    <svg aria-hidden fill="none" height={size} viewBox="0 0 16 16" width={size}>
      <circle cx="8" cy="8" r="6.5" stroke={ringColor} strokeWidth="1.5" />
      <path
        d="M14.5 8 A 6.5 6.5 0 0 1 8 14.5"
        fill="none"
        stroke={mainColor}
        strokeLinecap="round"
        strokeWidth="1.5"
      >
        <animateTransform
          attributeName="transform"
          dur="1s"
          from="0 8 8"
          repeatCount="indefinite"
          to="360 8 8"
          type="rotate"
        />
      </path>
      <circle cx="8" cy="8" fill={mainColor} r="2.5" stroke={ringColor} strokeWidth="1" />
    </svg>
  );
});

interface TopicStatusIconProps {
  /**
   * What the glyph means in words, e.g. "Failed: <reason>". The glyph alone is
   * color and shape; a run that ended badly names its ending here so it is
   * readable on hover and by a screen reader.
   */
  label?: string;
  size?: number;
  status?: string | null;
}

const TopicStatusIcon = memo<TopicStatusIconProps>(({ label, size = 16, status }) => {
  if (status === 'running') return <RunningIcon size={size} />;
  const key = (status ?? 'pending') as keyof typeof STATIC_META;
  const meta = STATIC_META[key] ?? STATIC_META.pending;
  const StatusGlyph = meta.icon;
  const glyph = (
    <StatusGlyph aria-hidden={label ? true : undefined} color={meta.color} size={size} />
  );
  if (!label) return glyph;
  return (
    <span aria-label={label} className="inline-flex flex-none" role="img" title={label}>
      {glyph}
    </span>
  );
});

export default TopicStatusIcon;
