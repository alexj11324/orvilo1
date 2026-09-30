import { cssVar } from 'antd-style';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- Linear's unassigned avatar
import { Bot, CircleDashed, UserRound } from 'lucide-react';
import { memo } from 'react';

interface UnassignedAssigneeIconProps {
  kind: 'agent' | 'human';
  size?: number;
}

export const UnassignedAssigneeIcon = memo<UnassignedAssigneeIconProps>(({ kind, size = 18 }) => {
  const InnerIcon = kind === 'agent' ? Bot : UserRound;
  return (
    <div
      aria-hidden
      className="flex items-center justify-center"
      style={{
        color: cssVar.colorTextDescription,
        flexShrink: 0,
        height: size,
        position: 'relative',
        width: size,
      }}
    >
      <CircleDashed size={size} strokeWidth={1.5} />
      <InnerIcon size={Math.max(8, Math.round(size * 0.64))} style={{ position: 'absolute' }} />
    </div>
  );
});
