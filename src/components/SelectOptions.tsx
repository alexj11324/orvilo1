'use client';

import type { ReactNode } from 'react';

import { SelectGroup, SelectItem, SelectLabel } from '@/components/ui/select';

export interface SelectOptionLeaf<V = string> {
  disabled?: boolean;
  label: ReactNode;
  title?: string;
  value: V;
}

export interface SelectOptionGroup<V = string> {
  label: ReactNode;
  options: SelectOptionLeaf<V>[];
}

export type SelectOption<V = string> = SelectOptionLeaf<V> | SelectOptionGroup<V>;

export type SelectOptions<V = string> = SelectOption<V>[];

export const flattenSelectOptions = <V = string,>(options: SelectOptions<V>) =>
  options.flatMap((option) => ('options' in option ? option.options : [option]));

const optionText = <V,>(option: SelectOptionLeaf<V>) =>
  option.title ?? (typeof option.label === 'string' ? option.label : String(option.value));

/** base-ui `items` prop shape — drives the trigger's selected-label display. */
export const selectItems = <V = string,>(options: SelectOptions<V>) =>
  flattenSelectOptions(options).map((option) => ({
    label: optionText(option),
    value: option.value,
  }));

interface SelectOptionItemsProps<V = string> {
  itemClassName?: string;
  options: SelectOptions<V>;
}

export function SelectOptionItems<V = string>({
  options,
  itemClassName,
}: SelectOptionItemsProps<V>) {
  return options.map((option, index) => {
    if ('options' in option) {
      return (
        <SelectGroup key={index}>
          <SelectLabel>{option.label}</SelectLabel>
          {option.options.map((sub) => (
            <SelectItem
              className={itemClassName}
              disabled={sub.disabled}
              key={String(sub.value)}
              label={optionText(sub)}
              title={sub.title}
              value={sub.value}
            >
              {sub.label}
            </SelectItem>
          ))}
        </SelectGroup>
      );
    }
    return (
      <SelectItem
        className={itemClassName}
        disabled={option.disabled}
        key={String(option.value)}
        label={optionText(option)}
        title={option.title}
        value={option.value}
      >
        {option.label}
      </SelectItem>
    );
  });
}
