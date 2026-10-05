'use client';

import { useTheme } from 'antd-style';
import { TriangleAlert } from 'lucide-react';
import { createElement, type CSSProperties, memo } from 'react';

interface SilentFallbackProps {
  minHeight?: number;
  style?: CSSProperties;
}

const SilentFallback = memo<SilentFallbackProps>(({ minHeight = 36, style }) => {
  const theme = useTheme();

  return (
    <div
      style={{
        alignItems: 'center',
        border: `1px dashed ${theme.colorBorderSecondary}`,
        borderRadius: theme.borderRadiusSM,
        color: theme.colorTextQuaternary,
        display: 'flex',
        fontSize: 12,
        gap: 4,
        justifyContent: 'center',
        minHeight,
        ...style,
      }}
    >
      {createElement(TriangleAlert, { size: 14 })}
      <span>Render Error</span>
    </div>
  );
});

SilentFallback.displayName = 'SilentFallback';

export default SilentFallback;
