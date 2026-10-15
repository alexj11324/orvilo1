import type { UserNeutralColor } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ColorSwatches, type ColorSwatchesProps } from '@/components/ColorSwatches';
import { findNeutralThemeName, neutralColors } from '@/styles/nativeThemeSwatches';

interface IProps {
  onChange?: (v: UserNeutralColor | '') => void;
  value?: UserNeutralColor | '';
}

const ThemeSwatchesNeutral = memo<IProps>(({ value, onChange }) => {
  const { t } = useTranslation('color');

  const handleSelect: ColorSwatchesProps['onChange'] = (v) => {
    const name = findNeutralThemeName(v);
    onChange?.(name || '');
  };

  return (
    <ColorSwatches
      value={value ? neutralColors[value] : undefined}
      colors={[
        {
          color: 'rgba(0, 0, 0, 0)',
          title: t('default'),
        },
        {
          color: neutralColors.mauve,
          title: t('mauve'),
        },
        {
          color: neutralColors.olive,
          title: t('olive'),
        },
        {
          color: neutralColors.sage,
          title: t('sage'),
        },
        {
          color: neutralColors.sand,
          title: t('sand'),
        },
        {
          color: neutralColors.slate,
          title: t('slate'),
        },
      ]}
      onChange={handleSelect}
    />
  );
});

export default ThemeSwatchesNeutral;
