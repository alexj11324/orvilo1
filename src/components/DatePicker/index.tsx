'use client';

import { cn } from 'cn';
import dayjs, { type Dayjs } from 'dayjs';
import { CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  type CSSProperties,
  memo,
  type ReactNode,
  type SyntheticEvent,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { useCalendarLocale } from './calendarLocale';

type PickerMode = 'date' | 'day' | 'month' | 'quarter' | 'halfYear' | 'year';

export interface DatePickerProps {
  'allowClear'?: boolean;
  'aria-label'?: string;
  'className'?: string;
  'classNames'?: { popup?: { root?: string } };
  'defaultValue'?: Dayjs | null;
  'disabled'?: boolean;
  'format'?: string | ((date: Dayjs) => string);
  'minDate'?: Dayjs;
  'onChange'?: (value: Dayjs | Dayjs[] | null) => void;
  'onOpenChange'?: (open: boolean) => void;
  'open'?: boolean;
  'panelRender'?: (panel: ReactNode) => ReactNode;
  'picker'?: PickerMode;
  'placeholder'?: string;
  'prefix'?: ReactNode;
  'renderExtraFooter'?: () => ReactNode;
  'showNow'?: boolean;
  'size'?: 'default' | 'small';
  'style'?: CSSProperties;
  'suffixIcon'?: ReactNode;
  /** Hover hint for the trigger; suppressed while the popover is open. */
  'tooltip'?: ReactNode;
  'value'?: Dayjs | null;
  /**
   * `ghost` renders the trigger as a bare ghost `Button` that takes its whole
   * look from `className` (used by property pills); default is the bordered field.
   */
  'variant'?: 'field' | 'ghost';
}

const cellButtonClass = 'w-full rounded-lg hover:bg-accent';
const cellVariant = (selected: boolean) => (selected ? 'default' : 'ghost');

const PeriodGrid = ({
  disabledBefore,
  localeCode,
  onPick,
  picker,
  viewYear,
  value,
}: {
  disabledBefore?: Dayjs;
  localeCode?: string;
  onPick: (date: Dayjs) => void;
  picker: PickerMode;
  viewYear: number;
  value?: Dayjs | null;
}) => {
  const { t } = useTranslation('common');
  const [year, setYear] = useState(viewYear);
  const months = Array.from({ length: 12 }, (_, i) =>
    new Date(2000, i, 1).toLocaleString(localeCode, { month: 'short' }),
  );
  const header = (
    <div className="flex items-center justify-between px-1 pb-1">
      <Button
        aria-label={t('datePicker.previous')}
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={() => setYear((y) => y - (picker === 'year' ? 12 : 1))}
      >
        <ChevronLeft size={14} />
      </Button>
      <span className="text-sm font-medium">
        {picker === 'year' ? `${year - 5} - ${year + 6}` : year}
      </span>
      <Button
        aria-label={t('datePicker.next')}
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={() => setYear((y) => y + (picker === 'year' ? 12 : 1))}
      >
        <ChevronRight size={14} />
      </Button>
    </div>
  );

  if (picker === 'year')
    return (
      <div className="w-64 p-2">
        {header}
        <div className="grid grid-cols-3 gap-1">
          {Array.from({ length: 12 }, (_, i) => year - 5 + i).map((y) => (
            <Button
              className={cellButtonClass}
              disabled={disabledBefore ? y < disabledBefore.year() : false}
              key={y}
              type="button"
              variant={cellVariant(value?.year() === y)}
              onClick={() => onPick(dayjs().year(y).startOf('year'))}
            >
              {y}
            </Button>
          ))}
        </div>
      </div>
    );

  if (picker === 'quarter' || picker === 'halfYear') {
    const count = picker === 'quarter' ? 4 : 2;
    const step = 12 / count;
    return (
      <div className="w-64 p-2">
        {header}
        <div className={cn('grid gap-1', count === 4 ? 'grid-cols-4' : 'grid-cols-2')}>
          {Array.from({ length: count }, (_, i) => {
            const date = dayjs()
              .year(year)
              .month(i * step)
              .startOf('month');
            const selected = value?.year() === year && value?.month() === i * step;
            return (
              <Button
                className={cellButtonClass}
                disabled={disabledBefore ? date.isBefore(disabledBefore) : false}
                key={i}
                type="button"
                variant={cellVariant(selected)}
                onClick={() => onPick(date)}
              >
                {picker === 'quarter' ? `Q${i + 1}` : `H${i + 1}`}
              </Button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 p-2">
      {header}
      <div className="grid grid-cols-3 gap-1">
        {months.map((label, i) => {
          const date = dayjs().year(year).month(i).startOf('month');
          const selected = value?.year() === year && value?.month() === i;
          return (
            <Button
              className={cellButtonClass}
              disabled={disabledBefore ? date.isBefore(disabledBefore) : false}
              key={label}
              type="button"
              variant={cellVariant(selected)}
              onClick={() => onPick(date)}
            >
              {label}
            </Button>
          );
        })}
      </div>
    </div>
  );
};

const DatePicker = memo<DatePickerProps>(
  ({
    allowClear,
    'aria-label': ariaLabel,
    className,
    classNames,
    defaultValue,
    disabled,
    format,
    minDate,
    onChange,
    onOpenChange,
    'open': openProp,
    panelRender,
    picker = 'date',
    placeholder,
    prefix,
    renderExtraFooter,
    size,
    style,
    suffixIcon,
    tooltip,
    value,
    variant = 'field',
  }) => {
    const { t } = useTranslation('common');
    const calendarLocale = useCalendarLocale();
    const [innerOpen, setInnerOpen] = useState(false);
    const [innerValue, setInnerValue] = useState<Dayjs | null>(defaultValue ?? null);
    const open = openProp ?? innerOpen;
    const setOpen =
      openProp === undefined
        ? (next: boolean) => {
            setInnerOpen(next);
            onOpenChange?.(next);
          }
        : onOpenChange;
    const currentValue = value === undefined ? innerValue : value;

    const display = useMemo(() => {
      if (!currentValue) return '';
      if (typeof format === 'function') return format(currentValue);
      return currentValue.format(format ?? 'YYYY-MM-DD');
    }, [format, currentValue]);

    const pick = (date: Dayjs | null) => {
      setInnerValue(date);
      onChange?.(date);
      setOpen?.(false);
    };

    const clearValue = (e: SyntheticEvent) => {
      e.stopPropagation();
      setInnerValue(null);
      onChange?.(null);
    };

    const isDayPicker = picker === 'date' || picker === 'day';
    const panel = (
      <>
        {isDayPicker ? (
          <Calendar
            defaultMonth={currentValue?.toDate() ?? minDate?.toDate()}
            disabled={minDate ? { before: minDate.startOf('day').toDate() } : undefined}
            locale={calendarLocale}
            mode="single"
            selected={currentValue?.toDate()}
            weekStartsOn={1}
            onSelect={(date) => pick(date ? dayjs(date) : null)}
          />
        ) : (
          <PeriodGrid
            disabledBefore={minDate}
            localeCode={calendarLocale.code}
            picker={picker}
            value={currentValue}
            viewYear={currentValue?.year() ?? dayjs().year()}
            onPick={pick}
          />
        )}
        {renderExtraFooter?.()}
      </>
    );

    const triggerContent = (
      <>
        {prefix ?? <CalendarIcon className="text-muted-foreground" size={13} />}
        <span
          className={cn(
            'truncate text-left',
            variant === 'field' && 'flex-1',
            !display && 'text-muted-foreground',
          )}
        >
          {display || placeholder}
        </span>
        {allowClear && currentValue ? (
            <span
              {...clickableProps()}
              aria-label={t('datePicker.clear')}
              className={cn(
                'flex items-center rounded-sm text-muted-foreground hover:text-foreground',
                CLICKABLE_FOCUS_RING,
              )}
              onClick={clearValue}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
                // The span sits inside the trigger button: keep Enter/Space from opening the popover.
                e.preventDefault();
                e.stopPropagation();
                clearValue(e);
              }}
            >
              <X size={13} />
            </span>
        ) : suffixIcon === null ? null : (
          (suffixIcon ?? null)
        )}
      </>
    );

    const triggerProps = {
      'aria-label': ariaLabel,
      'disabled': disabled,
      style,
    };

    const trigger =
      variant === 'ghost' ? (
        <Button className={className} type="button" variant="ghost" {...triggerProps} />
      ) : (
        <Button
          type="button"
          variant="outline"
          {...triggerProps}
          className={cn(
            'w-full justify-start gap-1.5 rounded-lg border-input bg-transparent font-normal hover:bg-accent',
            size === 'small' && 'h-7 text-[13px]',
            className,
          )}
        />
      );

    const popover = (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={tooltip ? <TooltipTrigger render={trigger} /> : trigger}>
          {triggerContent}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className={cn('w-auto p-0', classNames?.popup?.root)}
          side="bottom"
        >
          {panelRender ? panelRender(panel) : panel}
        </PopoverContent>
      </Popover>
    );

    if (!tooltip) return popover;
    return (
      <Tooltip disabled={open}>
        {popover}
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    );
  },
);

DatePicker.displayName = 'DatePicker';

export default DatePicker;
