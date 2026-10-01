import { type PropsWithChildren } from 'react';
import { memo } from 'react';

import { Separator } from '@/components/ui/separator';

const ExtraContainer = memo<PropsWithChildren>(({ children }) => {
  return (
    <div>
      <Separator style={{ margin: '0 0 8px 0' }} />
      {children}
    </div>
  );
});

export default ExtraContainer;
