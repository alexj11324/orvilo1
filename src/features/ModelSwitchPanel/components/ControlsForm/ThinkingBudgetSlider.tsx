import { Flexbox } from '@lobehub/ui';
import { Input } from '@lobehub/ui/base-ui';
import { memo, useMemo, useState } from 'react';
import useMergeState from 'use-merge-value';

import DiscreteSlider from '@/components/DiscreteSlider';

// Define special value mappings
const SPECIAL_VALUES = {
  AUTO: -1,
  OFF: 0,
};

// Define slider position to actual value mapping
const SLIDER_TO_VALUE_MAP = [
  SPECIAL_VALUES.AUTO, // Position 0 -> -1 (Auto)
  SPECIAL_VALUES.OFF, // Position 1 -> 0 (OFF)
  128, // Position 2 -> 128
  512, // Position 3 -> 512
  1024, // Position 4 -> 1024
  2048, // Position 5 -> 2048
  4096, // Position 6 -> 4096
  8192, // Position 7 -> 8192
  16_384, // Position 8 -> 16384
  24_576, // Position 9 -> 24576
  32_768, // Position 10 -> 32768
];

// Get slider position from actual value
const getSliderPosition = (value: number): number => {
  const exactIndex = SLIDER_TO_VALUE_MAP.indexOf(value);
  if (exactIndex !== -1) return exactIndex;

  if (value <= SPECIAL_VALUES.AUTO) return 0;
  if (value > SPECIAL_VALUES.OFF && value <= 128) return 2;

  let position = 0;

  for (const [index, mappedValue] of SLIDER_TO_VALUE_MAP.entries()) {
    if (mappedValue <= value) {
      position = index;
      continue;
    }

    break;
  }

  return position;
};

// Get actual value from slider position (fix: 0 is no longer treated as falsy)
const getValueFromPosition = (position: number): number => {
  const v = SLIDER_TO_VALUE_MAP[position];
  return v === undefined ? SPECIAL_VALUES.AUTO : v;
};

interface ThinkingBudgetSliderProps {
  defaultValue?: number;
  onChange?: (value: number) => void;
  value?: number;
}

const ThinkingBudgetSlider = memo<ThinkingBudgetSliderProps>(
  ({ value, onChange, defaultValue }) => {
    // First determine the initial budget value
    const initialBudget = value ?? defaultValue ?? SPECIAL_VALUES.AUTO;

    const [budget, setBudget] = useMergeState(initialBudget, {
      defaultValue,
      onChange,
      value,
    });

    const sliderPosition = getSliderPosition(budget);

    const updateWithSliderPosition = (position: number) => {
      const newValue = getValueFromPosition(position);
      setBudget(newValue);
    };

    const [draft, setDraft] = useState<string | null>(null);

    const formatBudget = (v: number) => {
      if (v === SPECIAL_VALUES.AUTO) return 'Auto';
      if (v === SPECIAL_VALUES.OFF) return 'OFF';
      return `${v}`;
    };

    const commitDraft = (raw: string) => {
      const text = raw.trim().toLowerCase();
      if (text === 'auto') {
        setBudget(SPECIAL_VALUES.AUTO);
        return;
      }
      if (text === 'off') {
        setBudget(SPECIAL_VALUES.OFF);
        return;
      }
      const parsed = Number.parseInt(text.replaceAll(/[^\d-]/g, ''), 10);
      if (!Number.isNaN(parsed)) setBudget(Math.min(32_768, Math.max(-1, parsed)));
    };

    const options = useMemo(
      () =>
        ['Auto', 'OFF', '128', '512', '1K', '2K', '4K', '8K', '16K', '24K', '32K'].map(
          (label, value) => ({ label, value }),
        ),
      [],
    );

    return (
      <Flexbox horizontal align={'center'} gap={12} paddingInline={'4px 0'}>
        <Flexbox flex={1}>
          <DiscreteSlider
            options={options}
            value={sliderPosition}
            onChange={updateWithSliderPosition}
          />
        </Flexbox>
        <div>
          <Input
            onBlur={(e) => {
              commitDraft(e.target.value);
              setDraft(null);
            }}
            onChange={(e) => setDraft(e.target.value)}
            onPressEnter={(e) => {
              commitDraft((e.target as HTMLInputElement).value);
              setDraft(null);
            }}
            style={{ width: 80 }}
            value={draft ?? formatBudget(budget)}
          />
        </div>
      </Flexbox>
    );
  },
);

export default ThinkingBudgetSlider;
