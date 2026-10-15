'use client';

import type { LucideIcon } from 'lucide-react';
import { memo } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const styles = {
  option: 'flex flex-1 gap-2 items-start min-w-0',
  optionDesc: 'text-xs leading-5 text-foreground-description text-pretty',
  optionIcon: 'flex flex-none items-center justify-center h-5.5 text-muted-foreground',
  optionLabel: 'text-sm leading-5.5 text-foreground',
  popup: 'max-w-[calc(100vw-24px)]',
  trigger: 'flex flex-1 gap-2 items-center min-w-0',
  triggerLabel: 'truncate text-start text-sm leading-5.5',
};

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
      <SelectTrigger className="w-full" size="normal">
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
              <div className="flex flex-col flex-1 min-w-0 gap-0.5">
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
