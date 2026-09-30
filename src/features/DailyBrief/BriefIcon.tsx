import { type BriefType } from '@orvilo/types';
import { cssVar } from 'antd-style';
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
  decision: cssVar.colorInfo,
  error: cssVar.colorError,
  insight: cssVar.colorInfo,
  result: cssVar.colorSuccess,
} as const;

const BRIEF_TYPE_COLOR_BG: Record<BriefType, string | undefined> = {
  decision: cssVar.colorInfoBgHover,
  error: cssVar.colorErrorBgHover,
  insight: cssVar.colorInfoBgHover,
  result: cssVar.colorSuccessBgHover,
} as const;

interface BriefIconProps {
  muted?: boolean;
  size?: number;
  type: BriefType;
}

const BriefIcon = memo<BriefIconProps>(({ size = 28, type, muted = false }) => {
  const icon = BRIEF_TYPE_ICON[type] || Lightbulb;
  const color = muted ? cssVar.colorTextQuaternary : BRIEF_TYPE_COLOR[type] || cssVar.colorPrimary;
  const background = muted ? cssVar.colorFillQuaternary : BRIEF_TYPE_COLOR_BG[type];

  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ borderRadius: cssVar.borderRadius, height: size, width: size, background }}
    >
      {createElement(icon, { color, size: size * 0.6 })}
    </div>
  );
});

export default BriefIcon;
