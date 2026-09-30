import { cx } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

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
      <div className={cx(styles.list, 'flex flex-col gap-0.5')}>
        {indicators.map(({ id, preview, virtuosoIndex, width }, position) => {
          const isActive = activePosition === position;
          const label = preview || t('minimap.emptyPreview');

          return (
            <div
              aria-current={isActive ? 'true' : undefined}
              key={id}
              className={cx(
                cx(styles.item, isActive && styles.itemActive),
                'flex items-center gap-2.5 justify-end',
              )}
              onClick={() => onJump(virtuosoIndex)}
            >
              <span className={cx(styles.label, isActive && styles.labelActive)}>{label}</span>
              <div className={cx(styles.dash, isActive && styles.dashActive)} style={{ width }} />
            </div>
          );
        })}
      </div>
    );
  },
);

MinimapPreview.displayName = 'MinimapPreview';
