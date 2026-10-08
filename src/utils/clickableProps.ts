import type { KeyboardEvent } from 'react';

/**
 * Standard focus ring for a clickable non-button element, the same ring the
 * local `Button` uses so keyboard focus looks identical across the app.
 */
export const CLICKABLE_FOCUS_RING =
  'outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset';

interface ActivationKeyEvent {
  currentTarget: EventTarget | null;
  key: string;
  preventDefault: () => void;
  target: EventTarget | null;
}

/**
 * Enter / Space activation for an element that is clickable but cannot be a
 * real `<button>` (it contains other controls or block layout). It fires the
 * element's own `onClick` through a synthetic `click()`, so the mouse handler
 * stays the single source of behavior.
 *
 * Only fires when the element itself holds focus: keys that bubble from a
 * nested button, input or portaled menu must keep their own meaning.
 */
export const activateOnKey = (event: ActivationKeyEvent): void => {
  if (event.target !== event.currentTarget) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  (event.currentTarget as HTMLElement | null)?.click?.();
};

/**
 * Props that make a clickable `div` / `span` keyboard-operable. Spread them
 * next to the existing `onClick`; pass `false` when the click is inert (for
 * example `onClick={clickable ? open : undefined}`) so the element is not
 * announced or focusable as a button.
 */
export const clickableProps = (
  enabled: unknown = true,
): {
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  role?: 'button';
  tabIndex?: 0;
} => (enabled ? { onKeyDown: activateOnKey, role: 'button', tabIndex: 0 } : {});
