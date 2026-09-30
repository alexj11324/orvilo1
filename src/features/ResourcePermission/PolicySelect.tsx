'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import type { LucideIcon } from 'lucide-react';
import { memo } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const styles = createStaticStyles(({ css }) => ({
  option: css`
    display: flex;
    flex: 1;
    gap: 8px;
    align-items: flex-start;

    min-width: 0;
  `,
  optionDesc: css`
    font-size: 12px;
    line-height: 16px;
    color: ${cssVar.colorTextDescription};
    text-wrap: pretty;
  `,
  optionIcon: css`
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;

    height: 20px;

    color: ${cssVar.colorTextSecondary};
  `,
  optionLabel: css`
    font-size: 14px;
    line-height: 20px;
    color: ${cssVar.colorText};
  `,
  popup: css`
    max-width: calc(100vw - 24px);
  `,
  trigger: css`
    display: flex;
    flex: 1;
    gap: 8px;
    align-items: center;

    min-width: 0;
  `,
  triggerLabel: css`
    overflow: hidden;
    text-align: start;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

export interface PolicyOption<Value extends string> {
  /** Shown under the label inside the popup — also carries the "why is this disabled" reason. */
  desc?: string;
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  value: Value;
}

interface PolicySelectProps<Value extends string> {
  disabled?: boolean;
  loading?: boolean;
  onChange: (value: Value) => void;
  options: PolicyOption<Value>[];
  value?: Value;
}

/**
 * The one control shape shared by every row of the Agent / Agent Group
 * Permission pages: a two-line option in the popup (what it means), a single
 * compact line once chosen. Keeping every row on one component is what makes
 * "who can do what" read as a single decision rather than unrelated widgets.
 */
const PolicySelectInner = <Value extends string>({
  disabled,
  loading,
  onChange,
  options,
  value,
}: PolicySelectProps<Value>) => {
  return (
    <Select
      disabled={disabled || loading}
      value={value}
      onValueChange={(next) => {
        if (typeof next !== 'string' || next === value) return;
        onChange(next as Value);
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue>
          {(optionValue) => {
            const option = options.find((item) => item.value === optionValue);
            if (!option) return null;

            return (
              <span className={styles.trigger}>
                <span aria-hidden className={styles.optionIcon}>
                  <span className="anticon" role="img">
                    <option.icon fill={'transparent'} height={16} size={16} width={16} />
                  </span>
                </span>
                <span className={styles.triggerLabel}>{option.label}</span>
              </span>
            );
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className={styles.popup}>
        {options.map((option) => (
          <SelectItem disabled={option.disabled} key={option.value} value={option.value}>
            <span className={styles.option}>
              <span aria-hidden className={styles.optionIcon}>
                <span className="anticon" role="img">
                  <option.icon fill={'transparent'} height={16} size={16} width={16} />
                </span>
              </span>
              <div className="flex flex-col flex-1 gap-0.5" style={{ minWidth: 0 }}>
                <span className={styles.optionLabel}>{option.label}</span>
                {option.desc ? <span className={styles.optionDesc}>{option.desc}</span> : null}
              </div>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const PolicySelect = memo(PolicySelectInner) as typeof PolicySelectInner;

export default PolicySelect;
