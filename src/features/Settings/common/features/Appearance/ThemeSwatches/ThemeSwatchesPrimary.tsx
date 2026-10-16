import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ColorSwatches } from '@/components/ColorSwatches';
import {
  findPrimaryColorName,
  PRIMARY_COLOR_NAMES,
  type PrimaryColorName,
  primarySwatch,
} from '@/styles/theme/seeds';

interface IProps {
  onChange?: (v: PrimaryColorName | '') => void;
  value?: PrimaryColorName | '';
}

const ThemeSwatchesPrimary = memo<IProps>(({ onChange, value }) => {
  const { t } = useTranslation('color');

  return (
    <ColorSwatches
      value={value ? primarySwatch(value) : undefined}
      colors={[
        {
          color: 'rgba(0, 0, 0, 0)',
          title: t('default'),
        },
        ...PRIMARY_COLOR_NAMES.map((name) => ({ color: primarySwatch(name), title: t(name) })),
      ]}
      onChange={(color) => onChange?.((color && findPrimaryColorName(color)) || '')}
    />
  );
});

export default ThemeSwatchesPrimary;
