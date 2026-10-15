import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { ColorSwatches, type ColorSwatchesProps } from '@/components/ColorSwatches';
import { DEFAULT_BACKGROUND_COLOR } from '@/const/meta';
import { PRIMARY_COLOR_NAMES, primarySwatch } from '@/styles/theme/seeds';

interface BackgroundSwatchesProps extends Omit<ColorSwatchesProps, 'colors'> {
  disabled?: boolean;
  onValuesChange?: ColorSwatchesProps['onChange'];
}

const BackgroundSwatches = memo<BackgroundSwatchesProps>(
  ({
    defaultValue = DEFAULT_BACKGROUND_COLOR,
    value,
    onChange,
    onValuesChange,
    disabled,
    ...rest
  }) => {
    const { t } = useTranslation('color');

    const colors = useMemo(
      () => [
        {
          color: 'rgba(0, 0, 0, 0)',
          title: t('default'),
        },
        // Saved agent backgrounds hold these exact hex values.
        ...PRIMARY_COLOR_NAMES.map((name) => ({ color: primarySwatch(name), title: t(name) })),
      ],
      [t],
    );

    return (
      <ColorSwatches
        enableColorPicker
        colors={colors}
        defaultValue={defaultValue}
        disabled={disabled}
        value={value}
        style={{
          cursor: disabled ? 'not-allowed' : undefined,
          opacity: disabled ? 0.5 : undefined,
          pointerEvents: disabled ? 'none' : undefined,
          ...rest.style,
        }}
        onChange={(v) => {
          if (disabled) return;

          onChange?.(v);
          onValuesChange?.(v);
        }}
        {...rest}
      />
    );
  },
);

export default BackgroundSwatches;
