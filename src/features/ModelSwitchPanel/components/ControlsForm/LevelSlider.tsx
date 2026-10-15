import { Slider } from '@lobehub/ui/base-ui';
import { cn } from 'cn';
import type { CSSProperties, ReactNode } from 'react';
import { memo, useMemo } from 'react';
import useMergeState from 'use-merge-value';

const styles = {
  label:
    'min-h-7 cursor-pointer rounded-(--radius-input) border-0 bg-transparent p-0 text-sm leading-5.5 text-muted-foreground text-center wrap-anywhere transition-[color] duration-(--orvilo-motion-mid) ease-[ease] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-not-allowed motion-reduce:transition-none',
  labels: 'grid w-full gap-2',
  root: 'w-full',
  selectedLabel: 'text-foreground',
  slider: 'w-full px-1.5',
};

export type LevelSliderMark = ReactNode | { label?: ReactNode; style?: CSSProperties };

export interface LevelSliderProps<T extends string = string> {
  /**
   * Default value when uncontrolled
   */
  defaultValue?: T;
  disabled?: boolean;
  /**
   * Ordered array of level values (left to right on slider)
   */
  levels: readonly T[];
  /**
   * Optional custom marks. If not provided, uses level values as marks.
   */
  marks?: Record<number, LevelSliderMark>;
  /**
   * Callback when value changes
   */
  onChange?: (value: T) => void;
  /**
   * Style for the slider container
   */
  style?: CSSProperties;
  /**
   * Controlled value
   */
  value?: T;
}

interface LevelOption<T extends string> {
  label: ReactNode;
  style?: CSSProperties;
  value: T;
}

const getMinimumWidth = (levelCount: number, customMinWidth: CSSProperties['minWidth']) => {
  const minimumWidth = levelCount >= 5 ? 260 : levelCount === 4 ? 220 : 180;

  if (customMinWidth === undefined) return minimumWidth;

  return typeof customMinWidth === 'number'
    ? Math.max(customMinWidth, minimumWidth)
    : customMinWidth;
};

const resolveMark = (
  mark: LevelSliderMark | undefined,
  fallback: string,
): { label: ReactNode; style?: CSSProperties } => {
  if (!mark) return { label: fallback };

  if (typeof mark === 'object' && 'label' in mark) {
    return {
      label: mark.label ?? fallback,
      style: mark.style,
    };
  }

  return { label: mark as ReactNode };
};

function LevelSlider<T extends string = string>({
  levels,
  value,
  defaultValue,
  onChange,
  marks: customMarks,
  style,
  disabled,
}: LevelSliderProps<T>) {
  const defaultLevel = defaultValue ?? levels[Math.floor(levels.length / 2)];

  const [currentLevel, setCurrentLevel] = useMergeState<T>(defaultLevel, {
    defaultValue,
    onChange,
    value,
  });

  const options = useMemo(
    () =>
      levels.map<LevelOption<T>>((level, index) => ({
        ...resolveMark(customMarks?.[index], level),
        value: level,
      })),
    [customMarks, levels],
  );

  const currentIndex = levels.indexOf(currentLevel);
  const sliderValue = currentIndex === -1 ? Math.floor(levels.length / 2) : currentIndex;
  const { minWidth: customMinWidth, ...restStyle } = style ?? {};

  // Slider dots sit at i / (n - 1) of the track while equal grid columns center
  // labels at (i + 0.5) / n, so labels drift off their dots (e.g. 'none' / 'max'
  // float away from the track ends). Half-width edge columns with start/end
  // alignment pin the first/last labels to the ends and center the middle
  // labels exactly under their dots.
  const gridTemplateColumns =
    levels.length > 1
      ? [
          'minmax(0, 0.5fr)',
          ...Array.from({ length: levels.length - 2 }).fill('minmax(0, 1fr)'),
          'minmax(0, 0.5fr)',
        ].join(' ')
      : 'minmax(0, 1fr)';

  const handleChange = (index: number) => {
    if (disabled) return;

    const newLevel = levels[index];
    if (newLevel !== undefined) {
      setCurrentLevel(newLevel);
    }
  };

  return (
    <div
      className={cn('flex flex-col gap-2', styles.root)}
      style={{
        ...restStyle,
        minWidth: getMinimumWidth(levels.length, customMinWidth),
        width: '100%',
      }}
    >
      <div className={styles.slider}>
        <Slider
          disabled={disabled}
          max={levels.length - 1}
          min={0}
          step={1}
          value={sliderValue}
          onChange={handleChange}
        />
      </div>
      <div className={styles.labels} style={{ gridTemplateColumns }}>
        {options.map((option, index) => {
          const selected = index === sliderValue;
          const isFirst = index === 0;
          const isLast = index === levels.length - 1;
          const textAlign = isFirst === isLast ? 'center' : isFirst ? 'start' : 'end';

          return (
            <button
              aria-current={selected ? 'true' : undefined}
              className={cn(styles.label, selected && styles.selectedLabel)}
              disabled={disabled}
              key={option.value}
              style={{ textAlign, ...option.style }}
              type="button"
              onClick={() => {
                if (disabled) return;
                setCurrentLevel(option.value);
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default memo(LevelSlider) as typeof LevelSlider;
