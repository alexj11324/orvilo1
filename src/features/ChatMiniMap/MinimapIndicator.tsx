import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { CLICKABLE_FOCUS_RING } from '@/utils/clickableProps';

import { indicatorStyles } from './styles';
import { type MinimapIndicatorProps } from './types';

export const MinimapIndicator = memo<MinimapIndicatorProps>(
  ({ id, width, virtuosoIndex, position, activePosition, onJump }) => {
    const { t } = useTranslation('chat');
    const styles = indicatorStyles;

    const isActive = activePosition === position;

    return (
      <Button
        aria-current={isActive ? 'true' : undefined}
        aria-label={t('minimap.jumpToMessage', { index: position + 1 })}
        className={cn(styles.indicator, CLICKABLE_FOCUS_RING)}
        id={id}
        size={'icon'}
        variant={'ghost'}
        onClick={() => onJump(virtuosoIndex)}
      >
        <span
          aria-hidden
          style={{ width }}
          className={cn(
            styles.indicatorContent,
            isActive ? '[background:var(--primary)]' : '[background:var(--selected)]',
          )}
        />
      </Button>
    );
  },
);

MinimapIndicator.displayName = 'MinimapIndicator';
