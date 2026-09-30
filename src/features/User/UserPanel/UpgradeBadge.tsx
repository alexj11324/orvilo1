import { Tag } from '@lobehub/ui/base-ui';
import { type PropsWithChildren } from 'react';
import { memo } from 'react';

const UpgradeBadge = memo(({ children, showBadge }: PropsWithChildren<{ showBadge?: boolean }>) => {
  if (!showBadge) return children;

  return (
    <div className="flex items-center gap-0.5">
      {children}
      <Tag color={'info'} size={'small'} style={{ borderRadius: 16, paddingInline: 8 }}>
        new
      </Tag>
    </div>
  );
});

export default UpgradeBadge;
