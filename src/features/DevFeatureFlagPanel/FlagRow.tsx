'use client';

import { cn } from 'cn';
import { snakeCase } from 'es-toolkit/compat';
import { memo, useMemo } from 'react';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useServerConfigStore } from '@/store/serverConfig';
import { type FeatureFlagKey } from '@/store/serverConfig/slices/featureFlagOverride/action';

type SegmentedValue = 'true' | 'false' | 'inherit';

const styles = {
  control: 'flex-none',
  meta: 'font-mono text-xs leading-5 text-foreground-description',
  name: 'font-mono text-sm leading-5.5 font-medium text-foreground',
  row: 'flex gap-3 items-center justify-between py-1.5 px-3 border-be border-divider border-s-2 border-s-transparent transition-[background-color] duration-(--orvilo-motion-mid) ease-[ease] motion-reduce:transition-none hover:bg-accent',
  rowOverridden: 'border-s-warning bg-warning-wash hover:bg-(--ant-color-warning-bg-hover)',
};

const segmentOptions = [
  { label: 'true', value: 'true' as const },
  { label: 'false', value: 'false' as const },
  { label: 'inherit', value: 'inherit' as const },
];

interface FlagRowProps {
  flagKey: FeatureFlagKey;
}

const FlagRow = memo<FlagRowProps>(({ flagKey }) => {
  const original = useServerConfigStore((s) => s._originalFeatureFlags?.[flagKey]);
  const overrideValue = useServerConfigStore(
    (s) => s._featureFlagOverrides[flagKey] as boolean | undefined,
  );
  const setFlagOverride = useServerConfigStore((s) => s.setFlagOverride);

  const isOverridden = overrideValue !== undefined;

  const value: SegmentedValue = useMemo(() => {
    if (overrideValue === true) return 'true';
    if (overrideValue === false) return 'false';
    return 'inherit';
  }, [overrideValue]);

  const handleChange = (next: SegmentedValue) => {
    if (next === 'inherit') {
      setFlagOverride(flagKey, undefined);
      return;
    }
    setFlagOverride(flagKey, next === 'true');
  };

  return (
    <div className={cn(styles.row, isOverridden && styles.rowOverridden)}>
      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
        <div className={cn('truncate', 'block', styles.name)}>{snakeCase(flagKey as string)}</div>
        <span className={styles.meta}>server: {String(original)}</span>
      </div>
      <ToggleGroup
        className={styles.control}
        size="sm"
        value={[value]}
        onValueChange={(next) => next[0] && handleChange(next[0] as SegmentedValue)}
      >
        {segmentOptions.map((o) => (
          <ToggleGroupItem
            className="rounded-(--radius-input) text-sm leading-5.5 transition-[color,background-color,border-color,box-shadow] duration-(--orvilo-motion-mid) motion-reduce:transition-none"
            key={o.value}
            value={o.value}
          >
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
});

FlagRow.displayName = 'DevFeatureFlagPanel/FlagRow';

export default FlagRow;
