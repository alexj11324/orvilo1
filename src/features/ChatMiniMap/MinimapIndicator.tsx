import { cx } from 'antd-style';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { indicatorStyles } from './styles';
import { type MinimapIndicatorProps } from './types';

export const MinimapIndicator = memo<MinimapIndicatorProps>(
  ({ id, width, virtuosoIndex, position, activePosition, onJump }) => {
    const { t } = useTranslation('chat');
    const styles = indicatorStyles;

    const isActive = activePosition === position;

    return (
      <div
        {...clickableProps()}
        aria-current={isActive ? 'true' : undefined}
        aria-label={t('minimap.jumpToMessage', { index: position + 1 })}
        className={cn(styles.indicator, CLICKABLE_FOCUS_RING)}
        id={id}
        style={{ width }}
        onClick={() => onJump(virtuosoIndex)}
      >
        <div className={cx(styles.indicatorContent, isActive && styles.indicatorContentActive)} />
      </div>
    );
  },
);

MinimapIndicator.displayName = 'MinimapIndicator';
