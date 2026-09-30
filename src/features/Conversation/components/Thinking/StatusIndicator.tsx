import { cssVar } from 'antd-style';
import { AtomIcon, Loader2Icon } from 'lucide-react';
import { memo } from 'react';

interface StatusIndicatorProps {
  showDetail?: boolean;
  thinking?: boolean;
}

const StatusIndicator = memo<StatusIndicatorProps>(({ thinking, showDetail }) => {
  let icon;

  if (thinking) {
    icon = <Loader2Icon className="animate-spin" color={cssVar.colorTextDescription} />;
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
