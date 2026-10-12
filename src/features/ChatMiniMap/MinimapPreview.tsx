import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { CLICKABLE_FOCUS_RING } from '@/utils/clickableProps';

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
            <Button
              aria-current={isActive ? 'true' : undefined}
              key={id}
              size={'compact'}
              variant={'ghost'}
              className={cn(
                styles.item,
                isActive
                  ? 'bg-selected [&:hover]:bg-selected text-primary-text'
                  : 'text-muted-foreground',
                CLICKABLE_FOCUS_RING,
              )}
              onClick={() => onJump(virtuosoIndex)}
            >
              <span className={cn(styles.label, isActive && 'font-medium text-primary-text')}>
                {label}
              </span>
              <span
                aria-hidden
                style={{ width }}
                className={cn(
                  styles.dash,
                  isActive ? '[background:var(--primary)]' : '[background:var(--selected)]',
                )}
              />
            </Button>
          );
        })}
      </div>
    );
  },
);

MinimapPreview.displayName = 'MinimapPreview';
