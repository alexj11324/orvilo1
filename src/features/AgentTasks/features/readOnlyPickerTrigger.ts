import type { ReactElement, ReactNode } from 'react';
import { cloneElement, isValidElement } from 'react';

/**
 * Wrapper for a read-only trigger that is a real button. The button dims
 * itself when disabled, so the wrapper only carries the cursor.
 */
export const READ_ONLY_BUTTON_WRAPPER_CLASS = 'inline-flex max-w-full min-w-0 cursor-not-allowed';

/**
 * The trigger a picker renders when the viewer cannot edit. A caller-supplied
 * native button is disabled, which takes it out of the tab order and stops it
 * being announced as actionable; any other trigger is returned unchanged.
 */
export const readOnlyPickerTrigger = (trigger: ReactNode, nativeButton: boolean): ReactNode =>
  nativeButton && isValidElement(trigger)
    ? cloneElement(trigger as ReactElement<{ disabled?: boolean }>, { disabled: true })
    : trigger;
