import type { UserPrimaryColor } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ColorSwatches, type ColorSwatchesProps } from '@/components/ColorSwatches';
import { findPrimaryThemeName, primaryColors } from '@/styles/nativeThemeSwatches';

interface IProps {
  onChange?: (v: UserPrimaryColor | '') => void;
  value?: UserPrimaryColor | '';
}

const ThemeSwatchesPrimary = memo<IProps>(({ onChange, value }) => {
  const { t } = useTranslation('color');

  const handleSelect: ColorSwatchesProps['onChange'] = (v) => {
    const name = findPrimaryThemeName(v);
    onChange?.(name || '');
  };

  return (
    <ColorSwatches
      value={value ? primaryColors[value] : undefined}
      colors={[
        {
          color: 'rgba(0, 0, 0, 0)',
          title: t('default'),
        },
        {
          color: primaryColors.red,
          title: t('red'),
        },
        {
          color: primaryColors.orange,
          title: t('orange'),
        },
        {
          color: primaryColors.gold,
          title: t('gold'),
        },
        {
          color: primaryColors.yellow,
          title: t('yellow'),
        },
        {
          color: primaryColors.lime,
          title: t('lime'),
        },
        {
          color: primaryColors.green,
          title: t('green'),
        },
        {
          color: primaryColors.cyan,
          title: t('cyan'),
        },
        {
          color: primaryColors.blue,
          title: t('blue'),
        },
        {
          color: primaryColors.geekblue,
          title: t('geekblue'),
        },
        {
          color: primaryColors.purple,
          title: t('purple'),
        },
        {
          color: primaryColors.magenta,
          title: t('magenta'),
        },
        {
          color: primaryColors.volcano,
          title: t('volcano'),
        },
      ]}
      onChange={handleSelect}
    />
  );
});

export default ThemeSwatchesPrimary;
