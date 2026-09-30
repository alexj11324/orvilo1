'use client';

import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { snakeCase } from 'es-toolkit/compat';
import { memo, useMemo } from 'react';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useServerConfigStore } from '@/store/serverConfig';
import { type FeatureFlagKey } from '@/store/serverConfig/slices/featureFlagOverride/action';

type SegmentedValue = 'true' | 'false' | 'inherit';

const styles = createStaticStyles(({ css }) => ({
  control: css`
    flex: none;
  `,
  meta: css`
    font-family: ${cssVar.fontFamilyCode};
    font-size: 10px;
    color: ${cssVar.colorTextDescription};
  `,
  name: css`
    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorText};
  `,
  row: css`
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;

    padding-block: 6px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
    border-inline-start: 2px solid transparent;

    transition: background 120ms ease;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  rowOverridden: css`
    border-inline-start-color: ${cssVar.colorWarning};
    background: ${cssVar.colorWarningBg};

    &:hover {
      background: ${cssVar.colorWarningBgHover};
    }
  `,
}));

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
    <div className={cx(styles.row, isOverridden && styles.rowOverridden)}>
      <div className="flex flex-1 flex-col gap-0.5" style={{ minWidth: 0 }}>
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
          <ToggleGroupItem key={o.value} value={o.value}>
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
});

FlagRow.displayName = 'DevFeatureFlagPanel/FlagRow';

export default FlagRow;
