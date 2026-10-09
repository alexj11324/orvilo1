import { type CSSProperties } from 'react';
import { memo } from 'react';

import { Spinner } from '@/components/ui/spinner';

interface UpdateLoadingProps {
  size?: number;
  style?: CSSProperties;
}

const UpdateLoading = memo<UpdateLoadingProps>(({ size, style }) => {
  return (
    <div style={style}>
      <Spinner style={{ height: size ?? 16, width: size ?? 16 }} />
    </div>
  );
});

export default UpdateLoading;
