import { memo, useMemo } from 'react';
import useMergeState from 'use-merge-value';

import DiscreteSlider from '@/components/DiscreteSlider';
import InputNumber from '@/components/InputNumber';

const Kibi = 1024;
const MAX_VALUE = 32 * Kibi; // 32768

// Mark values mapped by equal-spaced indices
const MARK_TOKENS = [1, 2, 4, 8, 16, 32];

interface ReasoningTokenSlider32kProps {
  defaultValue?: number;
  onChange?: (value: number) => void;
  value?: number;
}

const ReasoningTokenSlider32k = memo<ReasoningTokenSlider32kProps>(
  ({ value, onChange, defaultValue }) => {
    const [token, setTokens] = useMergeState(0, {
      defaultValue,
      onChange,
      value,
    });

    // Convert token value to index
    const tokenToIndex = (t: number): number => {
      const k = t / Kibi;
      for (let i = 0; i < MARK_TOKENS.length - 1; i++) {
        if (k <= MARK_TOKENS[i]) return i;
      }
      return MARK_TOKENS.length - 1;
    };

    const [sliderIndex, setSliderIndex] = useMergeState(0, {
      defaultValue: typeof defaultValue === 'undefined' ? 0 : tokenToIndex(defaultValue),
      value: typeof value === 'undefined' ? 0 : tokenToIndex(value),
    });

    const options = useMemo(
      () => MARK_TOKENS.map((token, index) => ({ label: `${token}k`, value: index })),
      [],
    );

    const step = useMemo(() => {
      const current = token ?? 0;

      if (current <= Kibi) return 128;

      if (current < 8 * Kibi) return Kibi;

      return 4 * Kibi;
    }, [token]);

    return (
      <div className="flex items-center gap-3 ps-1">
        <div className="min-w-50 max-w-80 flex-1">
          <DiscreteSlider
            options={options}
            value={sliderIndex}
            onChange={(v) => {
              setSliderIndex(v);
              setTokens(MARK_TOKENS[v] * Kibi);
            }}
          />
        </div>
        <div>
          <InputNumber
            changeOnWheel
            className="w-20"
            max={MAX_VALUE}
            min={0}
            step={step}
            value={token}
            onChange={(e) => {
              if (!e && e !== 0) return;
              const clampedValue = Math.min(Math.round(e as number), MAX_VALUE);
              setTokens(clampedValue);
              setSliderIndex(tokenToIndex(clampedValue));
            }}
          />
        </div>
      </div>
    );
  },
);

export default ReasoningTokenSlider32k;
