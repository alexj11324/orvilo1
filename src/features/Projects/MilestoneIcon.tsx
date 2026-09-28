import { Icon } from '@lobehub/ui';
import { cssVar } from 'antd-style';
import { DiamondIcon } from 'lucide-react';
import { type CSSProperties, memo } from 'react';

import { MILESTONE_ICON_PAINT, MILESTONE_ICON_SIZE } from './milestoneRow';

interface MilestoneIconProps {
  /**
   * Drop the brand-indigo paint for the "absent" contexts — the `No milestone`
   * bucket, picker rows that read as placeholder affordances — where the
   * diamond keeps its shape but takes the quiet text tone instead. The
   * unassigned tone is `colorTextDescription`, the same grey the group-header
   * "No milestone" bucket already used.
   */
  muted?: boolean;
  /** Defaults to the reference-measured `MILESTONE_ICON_SIZE`; chips and
   *  timeline marks pass a smaller box. */
  size?: number;
  style?: CSSProperties;
}

/**
 * The one milestone glyph — Linear's two-tone indigo diamond. Every surface
 * that draws a milestone (overview cards, rail, milestones page, list chips,
 * timeline marks, task badges, group headers) renders through this so the
 * paint pair from `milestoneRow` cannot drift per call site. For menus and
 * route meta that only accept a bare `LucideIcon`, keep using `DiamondIcon`
 * directly — it is the same shape, unpainted by the host's own styling.
 */
const MilestoneIcon = memo<MilestoneIconProps>(({ muted, size = MILESTONE_ICON_SIZE, style }) => (
  <Icon
    {...(muted ? { color: cssVar.colorTextDescription } : MILESTONE_ICON_PAINT)}
    icon={DiamondIcon}
    size={size}
    style={style}
  />
));

MilestoneIcon.displayName = 'MilestoneIcon';

export default MilestoneIcon;
