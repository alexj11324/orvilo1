import type { KeyboardEvent } from 'react';

/** Focus ring shared with the Button primitive's `focus-visible` state. */
export const PRESSABLE_FOCUS_CLASS =
  'rounded-(--radius-input) outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/** True for the keys that activate a `role="button"`, from the element itself. */
export const isActivationKey = (key: string, targetIsCurrent: boolean) =>
  targetIsCurrent && (key === 'Enter' || key === ' ');

/**
 * Props that make a clickable non-button row keyboard-operable. Prefer a real
 * `<Button>`; use this only where the row holds nested controls (a menu) that
 * a button element could not contain. Keys pressed inside a nested control do
 * not activate the row.
 */
export const pressableProps = (onActivate: () => void) => ({
  onClick: onActivate,
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
    if (!isActivationKey(event.key, event.target === event.currentTarget)) return;
    event.preventDefault();
    onActivate();
  },
  role: 'button' as const,
  tabIndex: 0,
});
