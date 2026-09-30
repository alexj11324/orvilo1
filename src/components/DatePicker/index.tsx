'use client';

import { cn } from 'cn';
import dayjs, { type Dayjs } from 'dayjs';
import { CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { type CSSProperties, memo, type ReactNode, useMemo, useState } from 'react';

import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type PickerMode = 'date' | 'day' | 'month' | 'quarter' | 'halfYear' | 'year';

export interface DatePickerProps {
  'allowClear'?: boolean;
  'aria-label'?: string;
  'className'?: string;
  'classNames'?: { popup?: { root?: string } };
  'disabled'?: boolean;
  'format'?: string | ((date: Dayjs) => string);
  'minDate'?: Dayjs;
  'onChange'?: (value: Dayjs | Dayjs[] | null) => void;
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

const cellButton = (selected: boolean) =>
  cn(
    'h-8 w-full rounded-lg text-sm transition-colors hover:bg-accent',
    selected && 'bg-primary text-primary-foreground hover:bg-primary',
  );

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
  const [year, setYear] = useState(viewYear);
  const header = (
    <div className="flex items-center justify-between px-1 pb-1">
      <button
        aria-label="Previous"
        className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent"
        type="button"
        onClick={() => setYear((y) => y - (picker === 'year' ? 12 : 1))}
      >
        <ChevronLeft size={14} />
      </button>
      <span className="text-sm font-medium">
        {picker === 'year' ? `${year - 5} - ${year + 6}` : year}
      </span>
      <button
        aria-label="Next"
        className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent"
        type="button"
        onClick={() => setYear((y) => y + (picker === 'year' ? 12 : 1))}
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );

  if (picker === 'year')
    return (
      <div className="w-64 p-2">
        {header}
        <div className="grid grid-cols-3 gap-1">
          {Array.from({ length: 12 }, (_, i) => year - 5 + i).map((y) => (
            <button
              className={cellButton(value?.year() === y)}
              disabled={disabledBefore ? y < disabledBefore.year() : false}
              key={y}
              type="button"
              onClick={() => onPick(dayjs().year(y).startOf('year'))}
            >
              {y}
            </button>
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
              <button
                className={cellButton(selected)}
                disabled={disabledBefore ? date.isBefore(disabledBefore) : false}
                key={i}
                type="button"
                onClick={() => onPick(date)}
              >
                {picker === 'quarter' ? `Q${i + 1}` : `H${i + 1}`}
              </button>
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
            <button
              className={cellButton(selected)}
              disabled={disabledBefore ? date.isBefore(disabledBefore) : false}
              key={label}
              type="button"
              onClick={() => onPick(date)}
            >
              {label}
            </button>
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
    disabled,
    format,
    minDate,
    onChange,
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
    const [innerOpen, setInnerOpen] = useState(false);
    const open = openProp ?? innerOpen;
    const setOpen = openProp === undefined ? setInnerOpen : undefined;

    const display = useMemo(() => {
      if (!value) return '';
      if (typeof format === 'function') return format(value);
      return value.format(format ?? 'YYYY-MM-DD');
    }, [format, value]);

    const pick = (date: Dayjs | null) => {
      onChange?.(date);
      setOpen?.(false);
    };

    const isDayPicker = picker === 'date' || picker === 'day';
    const panel = (
      <>
        {isDayPicker ? (
          <Calendar
            defaultMonth={value?.toDate() ?? minDate?.toDate()}
            mode="single"
            selected={value?.toDate()}
            disabled={minDate ? { before: minDate.startOf('day').toDate() } : undefined}
            onSelect={(date) => pick(date ? dayjs(date) : null)}
          />
        ) : (
          <PeriodGrid
            disabledBefore={minDate}
            picker={picker}
            value={value}
            viewYear={value?.year() ?? dayjs().year()}
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
            <button
              aria-label={ariaLabel}
              disabled={disabled}
              style={style}
              type="button"
              className={cn(
                'flex h-8 w-full items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50',
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
          {allowClear && value ? (
            <span
              aria-hidden
              className="flex items-center text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange?.(null);
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
