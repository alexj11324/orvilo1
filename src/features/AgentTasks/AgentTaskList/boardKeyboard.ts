import type { KeyboardSensorOptions } from '@dnd-kit/core';

/**
 * dnd-kit starts and ends a keyboard drag on Space *and* Enter, which leaves a
 * focused card with no key that opens it. Space keeps the drag, Enter opens.
 */
export const boardKeyboardCodes: NonNullable<KeyboardSensorOptions['keyboardCodes']> = {
  cancel: ['Escape'],
  end: ['Space'],
  start: ['Space'],
};

/** Enter opens the focused card — unless a keyboard drag is running or the key came from a child control. */
export const shouldOpenCardOnKey = ({
  isDragging,
  key,
  targetIsCard,
}: {
  isDragging: boolean;
  key: string;
  targetIsCard: boolean;
}): boolean => key === 'Enter' && targetIsCard && !isDragging;
