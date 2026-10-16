import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ColorSwatches } from '@/components/ColorSwatches';
import {
  findNeutralColorName,
  NEUTRAL_COLOR_NAMES,
  type NeutralColorName,
  neutralSwatch,
} from '@/styles/theme/seeds';

interface IProps {
  onChange?: (v: NeutralColorName | '') => void;
  value?: NeutralColorName | '';
}

const ThemeSwatchesNeutral = memo<IProps>(({ value, onChange }) => {
  const { t } = useTranslation('color');

  return (
    <ColorSwatches
      value={value ? neutralSwatch(value) : undefined}
      colors={[
        {
          color: 'rgba(0, 0, 0, 0)',
          title: t('default'),
        },
        ...NEUTRAL_COLOR_NAMES.map((name) => ({ color: neutralSwatch(name), title: t(name) })),
      ]}
      onChange={(color) => onChange?.((color && findNeutralColorName(color)) || '')}
    />
  );
});

export default ThemeSwatchesNeutral;
