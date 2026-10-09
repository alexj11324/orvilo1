import type { ReactElement, ReactNode } from 'react';

import { Button } from '@/components/ui/button';

import { PICKER_TRIGGER_FOCUS_CLASS, pickerTriggerStyle } from './pickerTriggerStyles';

/**
 * Opts a picker's trigger into a real ghost `Button` instead of the compact
 * wrapper — the Issue rail uses it so the whole value cell is the hit area,
 * with the Button's own hover wash and `focus-visible` ring.
 */
export interface PickerControl {
  className: string;
  /** Native tooltip for the control (e.g. what "unassigned" means). */
  title?: string;
}

interface PickerTriggerRender {
  /** Pass to the Base UI trigger's `nativeButton`. */
  nativeButton: boolean;
  /** Pass to the Base UI trigger's `render`. */
  render: ReactElement;
}

/**
 * The element a popover picker renders as its trigger. Without `control` it is
 * the compact focusable wrapper (clicks never reach the row behind it); with
 * `control` it is a native Button.
 */
export const pickerTriggerRender = (
  children: ReactNode,
  control?: PickerControl,
  style = pickerTriggerStyle,
  /** Accessible name of the compact wrapper; the rail `Button` is named by its content. */
  label?: string,
): PickerTriggerRender =>
  control
    ? {
        nativeButton: true,
        render: (
          <Button
            className={control.className}
            title={control.title}
            variant="ghost"
            onClick={(event) => event.stopPropagation()}
          >
            {children}
          </Button>
        ),
      }
    : {
        nativeButton: false,
        render: (
          <div
            aria-label={label}
            className={PICKER_TRIGGER_FOCUS_CLASS}
            style={style}
            onClick={(event) => event.stopPropagation()}
          >
            {children}
          </div>
        ),
      };
