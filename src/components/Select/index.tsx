'use client';

import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import type { CSSProperties, ReactNode } from 'react';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  useComboboxAnchor,
} from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
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
  'size'?: 'sm' | 'default' | 'small' | 'middle' | 'large' | 'lg' | 'compact' | 'normal';
  'style'?: CSSProperties;
  'value'?: Value | Value[] | null;
}

const isGroup = <Value,>(
  option: SelectOption<Value> | SelectOptionGroup<Value>,
): option is SelectOptionGroup<Value> => 'options' in option;

const isScalarValue = <Value extends string | number>(
  value: Value | Value[] | null | undefined,
): value is Value => typeof value === 'string' || typeof value === 'number';

type MultipleSelectOptionGroup<Value> = Readonly<{
  disabled?: boolean;
  group: boolean;
  index: number;
  items: readonly Value[];
  label?: ReactNode;
}>;

function MultipleSelectOptions<Value extends string | number>({
  labelFor,
  optionFor,
  optionRender,
}: Pick<SelectProps<Value>, 'optionRender'> & {
  labelFor: (value: Value) => ReactNode;
  optionFor: (value: Value) => SelectOption<Value> | undefined;
}) {
  const groups: readonly MultipleSelectOptionGroup<Value>[] =
    ComboboxPrimitive.useFilteredItems<MultipleSelectOptionGroup<Value>>();
  // Recount filtered leaf options per render; group labels do not consume an index.
  let optionIndex = 0;

  return (
    <ComboboxList>
      {groups.map((group) => {
        const children = group.items.map((v) => {
          const option = optionFor(v);
          const index = optionIndex++;
          return (
            <ComboboxItem
              className={option?.className}
              disabled={option?.disabled || group.disabled}
              key={String(v)}
              style={option?.style}
              value={v}
            >
              {option && optionRender ? optionRender(option, { index }) : labelFor(v)}
            </ComboboxItem>
          );
        });

        return group.group ? (
          <ComboboxGroup items={group.items} key={group.index}>
            <ComboboxLabel>{group.label}</ComboboxLabel>
            {children}
          </ComboboxGroup>
        ) : (
          <Fragment key={group.index}>{children}</Fragment>
        );
      })}
    </ComboboxList>
  );
}

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
  const { t } = useTranslation('common');
  const [query, setQuery] = useState('');
  const anchor = useComboboxAnchor();
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
    const groups: readonly MultipleSelectOptionGroup<Value>[] = (options ?? []).map(
      (option, index) =>
        isGroup(option)
          ? {
              disabled: option.disabled,
              group: true,
              index,
              items: option.options.map((o) => o.value),
              label: option.label,
            }
          : { group: false, index, items: [option.value] },
    );
    return (
      <Combobox
        multiple
        disabled={loading ? true : disabled}
        itemToStringLabel={(v) => textFor(v as Value)}
        items={groups}
        value={values}
        onOpenChange={(open) => onOpenChange?.(open)}
        onValueChange={(v) => onChange?.(v as Value[])}
      >
        <ComboboxChips
          aria-label={ariaLabel}
          className={className}
          ref={anchor}
          style={style}
          visualSize={
            size === undefined
              ? undefined
              : size === 'small' || size === 'sm'
                ? 'small'
                : size === 'compact'
                  ? 'compact'
                  : size === 'large' || size === 'lg'
                    ? 'large'
                    : size === 'normal'
                      ? 'normal'
                      : 'default'
          }
        >
          {values.map((v) => (
            <ComboboxChip key={String(v)}>{labelFor(v)}</ComboboxChip>
          ))}
          <ComboboxChipsInput
            aria-label={ariaLabel}
            id={id}
            placeholder={typeof placeholder === 'string' ? placeholder : undefined}
            onKeyDown={(event) => {
              if (
                event.key === 'Escape' &&
                event.currentTarget.getAttribute('aria-expanded') === 'false'
              ) {
                // Closed Escape dismisses ancestors; it must not clear this Select's values.
                event.preventBaseUIHandler();
              }
            }}
          />
          {allowClear && (
            <ComboboxClear
              aria-label={t('clear')}
              className="shrink-0"
              render={<Button size="icon-sm" type="button" variant="ghost" />}
              tabIndex={0}
            />
          )}
        </ComboboxChips>
        <ComboboxContent anchor={anchor} className={popupClassName}>
          <ComboboxEmpty>
            {typeof placeholder === 'string' ? placeholder : 'No options'}
          </ComboboxEmpty>
          <MultipleSelectOptions
            labelFor={labelFor}
            optionFor={optionFor}
            optionRender={optionRender}
          />
        </ComboboxContent>
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
      disabled={loading ? true : disabled}
      items={items}
      value={value === null ? null : isScalarValue(value) ? value : undefined}
      onOpenChange={(open) => onOpenChange?.(open)}
      onValueChange={(v) => onChange?.(v as Value | null | undefined)}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={className}
        id={id}
        style={style}
        size={
          size === undefined
            ? undefined
            : size === 'small' || size === 'sm'
              ? 'sm'
              : size === 'compact'
                ? 'compact'
                : size === 'large' || size === 'lg'
                  ? 'large'
                  : size === 'normal'
                    ? 'normal'
                    : 'default'
        }
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={popupClassName}>
        {showSearch && (
          <div className="px-1 pb-1">
            <Input
              aria-label={t('search', { defaultValue: 'Search' })}
              className="px-2 text-sm"
              value={query}
              visualSize="small"
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
