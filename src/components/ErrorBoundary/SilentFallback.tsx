'use client';

import { TriangleAlert } from 'lucide-react';
import { type CSSProperties, memo } from 'react';
import { useTranslation } from 'react-i18next';

interface SilentFallbackProps {
  minHeight?: number;
  style?: CSSProperties;
}

const SilentFallback = memo<SilentFallbackProps>(({ minHeight = 36, style }) => {
  const { t } = useTranslation('error');
  return (
    <div
      className="flex items-center justify-center gap-1 rounded-(--radius-card) border border-dashed border-divider text-xs leading-5 text-muted-foreground"
      role="status"
      style={{ minHeight, ...style }}
    >
      <TriangleAlert className="size-4 text-destructive-text" />
      <span>{t('error.title')}</span>
    </div>
  );
});

SilentFallback.displayName = 'SilentFallback';

export default SilentFallback;
