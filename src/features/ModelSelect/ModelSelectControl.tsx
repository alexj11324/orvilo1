import { cn } from 'cn';
import { X } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useFormControlContext } from '@/components/FormControlContext';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface ModelSelectOption {
  className?: string;
  disabled?: boolean;
  label: ReactNode;
  provider?: string;
  style?: CSSProperties;
  value: string;
}
interface OptionGroup {
  label: ReactNode;
  options: ModelSelectOption[];
}
export interface ModelSelectControlProps {
  allowClear?: boolean;
  className?: string;
  classNames?: {
    itemIndicator?: string;
    clear?: string;
    icon?: string;
    item?: string;
    groupLabel?: string;
  };
  defaultValue?: string | null;
  disabled?: boolean;
  labelRender?: (option: { label: ReactNode; value: string }) => ReactNode;
  loading?: boolean;
  onChange?: (value: string | null, option?: ModelSelectOption) => void;
  optionRender?: (option: ModelSelectOption) => ReactNode;
  options?: Array<ModelSelectOption | OptionGroup>;
  placeholder?: ReactNode;
  popupClassName?: string;
  popupMatchSelectWidth?: number | false;
  size?: 'small' | 'middle' | 'large' | 'compact' | 'normal';
  style?: CSSProperties;
  value?: string | null;
  variant?: 'filled' | 'outlined' | 'borderless';
}
const isGroup = (option: ModelSelectOption | OptionGroup): option is OptionGroup =>
  'options' in option;

/** The model picker alone owns its two-value callback and stale-option slots. */
const ModelSelectControl = ({
  allowClear,
  className,
  classNames,
  defaultValue,
  disabled,
  labelRender,
  loading,
  onChange,
  optionRender,
  options = [],
  placeholder,
  popupClassName,
  popupMatchSelectWidth,
  size,
  style,
  value,
  variant,
}: ModelSelectControlProps) => {
  const { t } = useTranslation('common');
  const containerRef = useRef<HTMLDivElement>(null);
  const leaves = options.flatMap((option) => (isGroup(option) ? option.options : [option]));
  const optionFor = (next: string | null) => leaves.find((option) => option.value === next);
  const formControl = useFormControlContext();
  const resolvedDisabled = (disabled ?? formControl.disabled) || loading;
  const item = (option: ModelSelectOption) => (
    <SelectItem
      className={cn(classNames?.item, option.className)}
      disabled={option.disabled}
      indicatorClassName={classNames?.itemIndicator}
      key={option.value}
      style={option.style}
      value={option.value}
    >
      {optionRender ? optionRender(option) : option.label}
    </SelectItem>
  );
  return (
    <Select
      defaultValue={defaultValue ?? undefined}
      disabled={resolvedDisabled}
      items={leaves.map(({ label, value }) => ({ label, value }))}
      value={value === undefined ? undefined : value}
      onValueChange={(next) => {
        if (next === null || typeof next === 'string') onChange?.(next, optionFor(next));
      }}
    >
      <div className="relative inline-flex min-w-0" ref={containerRef}>
        <SelectTrigger
          style={style}
          className={cn(
            className,
            allowClear && value != null && 'pe-14',
            variant === 'filled' && 'border-transparent bg-secondary',
            variant === 'borderless' && 'border-transparent',
          )}
          size={
            size === 'small'
              ? 'sm'
              : size === 'large'
                ? 'large'
                : size === 'compact'
                  ? 'compact'
                  : 'normal'
          }
        >
          <SelectValue placeholder={placeholder}>
            {labelRender
              ? (next) =>
                  typeof next === 'string'
                    ? labelRender({ label: optionFor(next)?.label, value: next })
                    : placeholder
              : undefined}
          </SelectValue>
        </SelectTrigger>
        {allowClear && value != null && (
          <Button
            aria-label={t('clear')}
            className={cn('absolute end-7 top-1/2 -translate-y-1/2', classNames?.clear)}
            disabled={resolvedDisabled}
            size="icon-xs"
            type="button"
            variant="ghost"
            onClick={() => {
              if (resolvedDisabled) return;
              onChange?.(null);
              containerRef.current
                ?.querySelector<HTMLButtonElement>('[data-slot="select-trigger"]')
                ?.focus();
            }}
          >
            <X aria-hidden />
          </Button>
        )}
      </div>
      <SelectContent
        className={popupClassName}
        style={
          typeof popupMatchSelectWidth === 'number' ? { width: popupMatchSelectWidth } : undefined
        }
      >
        {options.map((option, index) =>
          isGroup(option) ? (
            <SelectGroup key={index}>
              <SelectLabel className={classNames?.groupLabel}>{option.label}</SelectLabel>
              {option.options.map(item)}
            </SelectGroup>
          ) : (
            item(option)
          ),
        )}
      </SelectContent>
    </Select>
  );
};
export default ModelSelectControl;
