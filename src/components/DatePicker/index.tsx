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
  'value'?: Dayjs | null;
  'variant'?: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const cellButtonClass = 'w-full rounded-lg hover:bg-accent';
const cellVariant = (selected: boolean) => (selected ? 'default' : 'ghost');

const PeriodGrid = ({
  disabledBefore,
  onPick,
  picker,
  viewYear,
  value,
}: {
  disabledBefore?: Dayjs;
  onPick: (date: Dayjs) => void;
  picker: PickerMode;
  viewYear: number;
  value?: Dayjs | null;
}) => {
  const { t } = useTranslation('common');
  const [year, setYear] = useState(viewYear);
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
        {MONTHS.map((label, i) => {
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
    value,
  }) => {
    const { t } = useTranslation('common');
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
            mode="single"
            selected={currentValue?.toDate()}
            onSelect={(date) => pick(date ? dayjs(date) : null)}
          />
        ) : (
          <PeriodGrid
            disabledBefore={minDate}
            picker={picker}
            value={currentValue}
            viewYear={currentValue?.year() ?? dayjs().year()}
            onPick={pick}
          />
        )}
        {renderExtraFooter?.()}
      </>
    );

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              aria-label={ariaLabel}
              disabled={disabled}
              style={style}
              type="button"
              variant="outline"
              className={cn(
                'w-full justify-start gap-1.5 rounded-lg border-input bg-transparent font-normal hover:bg-accent',
                size === 'small' && 'h-7 text-[13px]',
                className,
              )}
            />
          }
        >
          {prefix ?? <CalendarIcon className="text-muted-foreground" size={13} />}
          <span className={cn('flex-1 truncate text-left', !display && 'text-muted-foreground')}>
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
  },
);

DatePicker.displayName = 'DatePicker';

export default DatePicker;
