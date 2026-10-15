import { memo, useMemo } from 'react';
import useMergeState from 'use-merge-value';

import DiscreteSlider from '@/components/DiscreteSlider';
import InputNumber from '@/components/InputNumber';

const Kibi = 1024;
const MAX_VALUE = 64 * Kibi; // 65536

const exponent = (num: number) => Math.log2(num);
const powerKibi = (num: number) => Math.round(Math.pow(2, num) * Kibi);

interface MaxTokenSliderProps {
  defaultValue?: number;
  onChange?: (value: number) => void;
  value?: number;
}

const ReasoningTokenSlider = memo<MaxTokenSliderProps>(({ value, onChange, defaultValue }) => {
  const [token, setTokens] = useMergeState(0, {
    defaultValue,
    onChange,
    value,
  });

  const [powValue, setPowValue] = useMergeState(0, {
    defaultValue: exponent(typeof defaultValue === 'undefined' ? 0 : defaultValue / 1024),
    value: exponent(typeof value === 'undefined' ? 0 : value / Kibi),
  });

  const updateWithPowValue = (value: number) => {
    setPowValue(value);

    setTokens(Math.min(powerKibi(value), MAX_VALUE));
  };

  const updateWithRealValue = (value: number) => {
    setTokens(Math.round(value));

    setPowValue(exponent(value / Kibi));
  };

  const options = useMemo(
    () => [1, 2, 4, 8, 16, 32, 64].map((item) => ({ label: `${item}k`, value: exponent(item) })),
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
      <div className="flex-1">
        <DiscreteSlider options={options} value={powValue} onChange={updateWithPowValue} />
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
            updateWithRealValue(e as number);
          }}
        />
      </div>
    </div>
  );
});
export default ReasoningTokenSlider;
