'use client';

import { XIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';
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
  ComboboxItem,
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
    return (
      <Combobox
        multiple
        disabled={loading ? true : disabled}
        itemToStringLabel={(v) => textFor(v as Value)}
        items={items.map((item) => item.value)}
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
        {allowClear && !disabled && isScalarValue(value) && (
          // The trigger is a <button>, so the clear affordance is a span that keeps
          // its press from reaching the trigger (which would open the popup).
          <span
            aria-label={t('clear')}
            className="-me-1 inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            role="button"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onChange?.(null);
            }}
          >
            <XIcon className="size-3.5" />
          </span>
        )}
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
