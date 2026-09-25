import { describe, expect, it } from 'vitest';

import {
  blockedPickerContentStyle,
  blockedPickerTriggerStyle,
  pickerTriggerStyle,
} from './pickerTriggerStyles';

describe('picker trigger styles', () => {
  // A running issue blocks its assignee and label pickers. The muting span
  // used to be an inline box, so the rail row's `width: 100%` resolved
  // against it and the row sat centered mid-rail instead of left-aligned.
  it('gives the blocked content wrapper no box of its own', () => {
    expect(blockedPickerContentStyle.display).toBe('contents');
    expect(blockedPickerContentStyle.pointerEvents).toBe('none');
  });

  it('lays the blocked trigger out exactly like the editable one', () => {
    const { cursor, opacity, ...layout } = blockedPickerTriggerStyle;
    expect(layout).toEqual(pickerTriggerStyle);
    expect(cursor).toBe('not-allowed');
    expect(opacity).toBe(0.5);
  });
});
