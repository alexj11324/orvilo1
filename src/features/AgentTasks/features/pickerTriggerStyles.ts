import type { CSSProperties } from 'react';

/**
 * Wrapper styles shared by the task pickers (assignee, labels) that wrap a
 * caller-rendered trigger — a card chip, a toolbar pill, or a full-width row
 * in the issue rail.
 *
 * The wrapper must never size the trigger: the rail row declares
 * `width: 100%`, and any box between it and the rail's stretched wrapper
 * shrinks it to its content, which the centering then parks mid-rail.
 */
export const pickerTriggerStyle: CSSProperties = {
  alignItems: 'center',
  display: 'inline-flex',
  justifyContent: 'center',
  lineHeight: 1,
  maxWidth: '100%',
  minWidth: 0,
};

export const blockedPickerTriggerStyle: CSSProperties = {
  ...pickerTriggerStyle,
  cursor: 'not-allowed',
  opacity: 0.5,
};

/**
 * Mutes clicks on a blocked trigger's content. `display: contents` drops the
 * span's own box, so the content keeps the size it has when editable, and the
 * inherited `pointer-events` still reaches every descendant.
 */
export const blockedPickerContentStyle: CSSProperties = {
  display: 'contents',
  pointerEvents: 'none',
};

/**
 * Keyboard focus ring for a picker trigger that is not a Button (a list-row or
 * board-card icon, an avatar). Same ring as the Button primitive's
 * `focus-visible` state; `rounded-(--radius-input)` gives the ring a shape
 * around a bare glyph.
 */
export const PICKER_TRIGGER_FOCUS_CLASS =
  'rounded-(--radius-input) outline-none focus-visible:ring-3 focus-visible:ring-ring/50';
