'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import {
  Select as SelectPrimitive,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SelectOption<Value = string> {
  className?: string;
  disabled?: boolean;
  label: ReactNode;
  style?: CSSProperties;
  value: Value;
}

interface SelectOptionGroup<Value = string> {
  disabled?: boolean;
  label: ReactNode;
  options: SelectOption<Value>[];
}

type SelectOptions<Value = string> = Array<SelectOption<Value> | SelectOptionGroup<Value>>;

interface SelectProps<Value = string> {
  'allowClear'?: boolean;
  'aria-label'?: string;
  'className'?: string;
  'defaultValue'?: Value | null;
  'disabled'?: boolean;
  'id'?: string;
  'loading'?: boolean;
  'mode'?: 'multiple';
  'onChange'?: (value: Value | Value[] | null | undefined) => void;
  'onOpenChange'?: (open: boolean) => void;
  'optionRender'?: (option: SelectOption<Value>, info: { index: number }) => ReactNode;
  'options'?: SelectOptions<Value>;
  'placeholder'?: ReactNode;
  'popupClassName'?: string;
  'showSearch'?: boolean;
  'size'?: 'sm' | 'default' | 'small' | 'middle' | 'large' | 'lg';
  'style'?: CSSProperties;
  'value'?: Value | Value[] | null;
}

const isGroup = <Value,>(
  option: SelectOption<Value> | SelectOptionGroup<Value>,
): option is SelectOptionGroup<Value> => 'options' in option;

const isScalarValue = <Value extends string | number>(
  value: Value | Value[] | null | undefined,
): value is Value => typeof value === 'string' || typeof value === 'number';

/**
 * Thin adapter exposing the lobehub base-ui Select surface (`options` +
 * `value` + `onChange(value)`) on top of `@/components/ui/select`.
 */
const Select = <Value extends string | number = string>({
  'aria-label': ariaLabel,
  allowClear,
  className,
  defaultValue,
  disabled,
  id,
  loading,
  mode,
  onChange,
  onOpenChange,
  optionRender,
  options,
  placeholder,
  popupClassName,
  showSearch,
  size,
  style,
  value,
}: SelectProps<Value>) => {
  const [query, setQuery] = useState('');
  const items = (options ?? []).flatMap((option) =>
    isGroup(option)
      ? option.options.map((o) => ({ label: o.label, value: o.value }))
      : [{ label: option.label, value: option.value }],
  );

  const optionFor = (v: Value): SelectOption<Value> | undefined => {
    for (const option of options ?? []) {
      const candidates = isGroup(option) ? option.options : [option];
      const found = candidates.find((o) => o.value === v);
      if (found) return found;
    }
    return undefined;
  };
  const labelFor = (v: Value): ReactNode => optionFor(v)?.label ?? String(v);
  const textFor = (v: Value): string => {
    const label = optionFor(v)?.label;
    return typeof label === 'string' ? label : String(v);
  };

  if (mode === 'multiple') {
    const values = (Array.isArray(value) ? value : []) as Value[];
    return (
      <Combobox
        multiple
        disabled={disabled || loading}
        itemToStringLabel={(v) => textFor(v as Value)}
        items={items.map((item) => item.value)}
        value={values}
        onValueChange={(v) => onChange?.(v as Value[])}
      >
        <ComboboxChips aria-label={ariaLabel} className={className} id={id} style={style}>
          {values.map((v) => (
            <ComboboxChip key={String(v)}>{labelFor(v)}</ComboboxChip>
          ))}
          <ComboboxChipsInput
            placeholder={typeof placeholder === 'string' ? placeholder : undefined}
          />
        </ComboboxChips>
        <ComboboxContent className={popupClassName}>
          <ComboboxEmpty>
            {typeof placeholder === 'string' ? placeholder : 'No options'}
          </ComboboxEmpty>
          <ComboboxList>
            {(v: string | number) => {
              const option = optionFor(v as Value);
              return (
                <ComboboxItem key={String(v)} value={v}>
                  {option && optionRender
                    ? (optionRender(option, { index: 0 }) as ReactNode)
                    : labelFor(v as Value)}
                </ComboboxItem>
              );
            }}
          </ComboboxList>
        </ComboboxContent>
        {allowClear && <ComboboxClear />}
      </Combobox>
    );
  }

  let index = 0;
  const renderOption = (option: SelectOption<Value>, groupDisabled?: boolean) => {
    const i = index;
    index += 1;
    return (
      <SelectItem
        className={option.className}
        disabled={option.disabled || groupDisabled}
        key={String(option.value)}
        style={option.style}
        value={option.value}
      >
        {optionRender ? optionRender(option, { index: i }) : option.label}
      </SelectItem>
    );
  };

  return (
    <SelectPrimitive
      defaultValue={defaultValue ?? undefined}
      disabled={disabled || loading}
      items={items}
      value={isScalarValue(value) ? value : undefined}
      onOpenChange={(open) => onOpenChange?.(open)}
      onValueChange={(v) => onChange?.(v as Value | null | undefined)}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={className}
        id={id}
        size={size === 'small' || size === 'sm' ? 'sm' : 'default'}
        style={style}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={popupClassName}>
        {showSearch && (
          <div className="px-1 pb-1">
            <input
              aria-label="search"
              className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none"
              value={query}
              // Keep keystrokes inside the input: the popup-level list
              // typeahead would otherwise preventDefault each character.
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
            />
          </div>
        )}
        {(options ?? []).map((option, i) =>
          isGroup(option) ? (
            <SelectGroup key={i}>
              <SelectLabel>{option.label}</SelectLabel>
              {option.options
                .filter(
                  (o) =>
                    !showSearch ||
                    !query ||
                    textFor(o.value).toLowerCase().includes(query.toLowerCase()),
                )
                .map((o) => renderOption(o, option.disabled))}
            </SelectGroup>
          ) : !showSearch ||
            !query ||
            textFor(option.value).toLowerCase().includes(query.toLowerCase()) ? (
            renderOption(option)
          ) : null,
        )}
      </SelectContent>
    </SelectPrimitive>
  );
};

export default Select;
export type { SelectOption, SelectOptionGroup, SelectOptions, SelectProps };
