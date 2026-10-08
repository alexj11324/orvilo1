import { describe, expect, it } from 'vitest';

import { boardKeyboardCodes, shouldOpenCardOnKey } from './boardKeyboard';

describe('boardKeyboardCodes', () => {
  it('leaves Enter free so it can open the card', () => {
    expect(boardKeyboardCodes.start).toEqual(['Space']);
    expect(boardKeyboardCodes.end).toEqual(['Space']);
  });

  it('keeps Escape as the way to cancel a keyboard drag', () => {
    expect(boardKeyboardCodes.cancel).toEqual(['Escape']);
  });
});

describe('shouldOpenCardOnKey', () => {
  const base = { isDragging: false, key: 'Enter', targetIsCard: true };

  it('opens on Enter from the card itself', () => {
    expect(shouldOpenCardOnKey(base)).toBe(true);
  });

  it('ignores other keys', () => {
    expect(shouldOpenCardOnKey({ ...base, key: ' ' })).toBe(false);
  });

  it('does not open while a keyboard drag is running', () => {
    expect(shouldOpenCardOnKey({ ...base, isDragging: true })).toBe(false);
  });

  it('does not hijack Enter pressed on a control inside the card', () => {
    expect(shouldOpenCardOnKey({ ...base, targetIsCard: false })).toBe(false);
  });
});
