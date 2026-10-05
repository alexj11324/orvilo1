import { type PropsWithChildren } from 'react';
import { memo } from 'react';

import { Badge } from '@/components/reui/badge';

const UpgradeBadge = memo(({ children, showBadge }: PropsWithChildren<{ showBadge?: boolean }>) => {
  if (!showBadge) return children;

  return (
    <div className="flex items-center gap-0.5">
      {children}
      <Badge size="sm" style={{ borderRadius: 16, paddingInline: 8 }} variant="info">
        new
      </Badge>
    </div>
  );
});

export default UpgradeBadge;
