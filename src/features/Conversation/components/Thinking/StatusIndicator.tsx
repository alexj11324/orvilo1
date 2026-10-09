import { cssVar } from 'antd-style';
import { AtomIcon } from 'lucide-react';
import { memo } from 'react';
// eslint-disable-next-line no-restricted-imports -- User-requested Libraries.dev visual replacement; keep the upstream orb implementation.
import { ThinkingOrb } from 'thinking-orbs';

interface StatusIndicatorProps {
  showDetail?: boolean;
  thinking?: boolean;
}

const StatusIndicator = memo<StatusIndicatorProps>(({ thinking, showDetail }) => {
  let icon;

  if (thinking) {
    icon = <ThinkingOrb aria-hidden size={20} state="solving" />;
  } else {
    icon = <AtomIcon color={showDetail ? cssVar.purple : cssVar.colorTextDescription} />;
  }

  return (
    <div
      className="flex items-center gap-1 justify-center"
      style={{
        flex: 'none',
        height: 24,
        border: `1px solid ${cssVar.colorBorder}`,
        borderRadius: cssVar.borderRadiusLG,
        width: 24,

        fontSize: 12,
      }}
    >
      {icon}
    </div>
  );
});

export default StatusIndicator;
