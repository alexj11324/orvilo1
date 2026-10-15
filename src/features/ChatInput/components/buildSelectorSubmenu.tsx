import { CheckIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { DropdownItem } from '@/components/ItemsMenu';

const styles = {
  value: 'font-sans',
};

const checkIcon = (
  <span className="anticon" role="img">
    <CheckIcon fill={'transparent'} height={16} size={16} width={16} />
  </span>
);

export interface SelectorOption<T extends string> {
  desc?: string;
  label: string;
  value: T;
}

/**
 * Submenu rows retain the current-value column through the local menu item contract.
 */
export type SelectorSubmenuItem = DropdownItem & { extra?: ReactNode };

export const buildSelectorSubmenu = <T extends string>({
  current,
  label,
  onSelect,
  options,
  valueLabel,
}: {
  current: T;
  label: string;
  onSelect: (value: T) => void;
  options: readonly SelectorOption<T>[];
  valueLabel: string;
}): SelectorSubmenuItem => ({
  children: options.map((option) => ({
    closeOnClick: false,
    desc: option.desc,
    extra: current === option.value ? checkIcon : undefined,
    key: `${label}-${option.value}`,
    label: option.label,
    onClick: () => onSelect(option.value),
  })),
  extra: <span className={styles.value}>{valueLabel}</span>,
  key: label,
  label,
  type: 'submenu',
});
