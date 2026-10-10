import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { previewStyles } from './styles';
import { type MinimapIndicator } from './types';

interface MinimapPreviewProps {
  activePosition: number | null;
  indicators: MinimapIndicator[];
  onJump: (virtuosoIndex: number) => void;
}

export const MinimapPreview = memo<MinimapPreviewProps>(
  ({ indicators, activePosition, onJump }) => {
    const { t } = useTranslation('chat');
    const styles = previewStyles;

    return (
      <div className={cn(styles.list, 'flex flex-col gap-0.5')}>
        {indicators.map(({ id, preview, virtuosoIndex, width }, position) => {
          const isActive = activePosition === position;
          const label = preview || t('minimap.emptyPreview');

          return (
            <div
              {...clickableProps()}
              aria-current={isActive ? 'true' : undefined}
              key={id}
              className={cn(
                styles.item,
                'flex items-center gap-2.5 justify-end',
                '[&:hover]:text-foreground',
                isActive ? 'text-primary' : 'text-(--ant-color-text-secondary)',
                CLICKABLE_FOCUS_RING,
              )}
              onClick={() => onJump(virtuosoIndex)}
            >
              <span className={cn(styles.label, isActive && 'font-medium text-primary')}>
                {label}
              </span>
              <div
                style={{ width }}
                className={cn(
                  styles.dash,
                  isActive
                    ? '[background:var(--primary)]'
                    : '[background:var(--ant-color-fill-secondary)]',
                )}
              />
            </div>
          );
        })}
      </div>
    );
  },
);

MinimapPreview.displayName = 'MinimapPreview';
