import { Loader2 } from 'lucide-react';
import { createElement, type CSSProperties } from 'react';
import { memo } from 'react';

interface UpdateLoadingProps {
  size?: number;
  style?: CSSProperties;
}

const UpdateLoading = memo<UpdateLoadingProps>(({ size, style }) => {
  return <div style={style}>{createElement(Loader2, { size: size ?? 16 })}</div>;
});

export default UpdateLoading;
