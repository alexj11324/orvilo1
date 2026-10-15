import { type BriefType } from '@orvilo/types';
import type { CircleDot } from 'lucide-react';
import { CheckCheckIcon, EyeIcon, HandIcon, Lightbulb, SirenIcon } from 'lucide-react';
import { createElement, memo } from 'react';

const BRIEF_TYPE_ICON: Record<BriefType, typeof CircleDot> = {
  decision: HandIcon,
  error: SirenIcon,
  insight: EyeIcon,
  result: CheckCheckIcon,
};

const BRIEF_TYPE_COLOR: Record<BriefType, string | undefined> = {
  decision: 'var(--info)',
  error: 'var(--destructive)',
  insight: 'var(--info)',
  result: 'var(--success)',
} as const;

const BRIEF_TYPE_COLOR_BG: Record<BriefType, string | undefined> = {
  decision: 'var(--info-hover-wash)',
  error: 'var(--destructive-wash-hover)',
  insight: 'var(--info-hover-wash)',
  result: 'var(--success-wash-hover)',
} as const;

interface BriefIconProps {
  muted?: boolean;
  size?: number;
  type: BriefType;
}

const BriefIcon = memo<BriefIconProps>(({ size = 28, type, muted = false }) => {
  const icon = BRIEF_TYPE_ICON[type] || Lightbulb;
  const color = muted ? 'var(--foreground-quaternary)' : BRIEF_TYPE_COLOR[type] || 'var(--primary)';
  const background = muted ? 'var(--fill-quaternary)' : BRIEF_TYPE_COLOR_BG[type];

  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ borderRadius: 'var(--radius-card)', height: size, width: size, background }}
    >
      {createElement(icon, { color, size: size * 0.6 })}
    </div>
  );
});

export default BriefIcon;
