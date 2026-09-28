import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import { createTimezoneGroups } from './onboarding';

// The submitted timezone must be a stable, locale-independent IANA id — the
// localized label is display-only. Before the fix the picker's value WAS the
// localized label (e.g. "(GMT+1) Berlin"), which the backend cannot interpret,
// so the stub below mimics exactly that old label shape.
const t = ((key: string) => `(GMT+X) ${key}`) as TFunction<'onboarding'>;

describe('createTimezoneGroups', () => {
  it('uses valid IANA timezone ids as option values', () => {
    const groups = createTimezoneGroups(t);
    const options = groups.flatMap((group) => group.items);

    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      expect(option.value).toMatch(/^[A-Z_]+\/[A-Z_]+/i);
      // Intl throws RangeError for anything that is not a real IANA id.
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone: option.value })).not.toThrow();
    }
  });

  it('keeps localized labels separate from stored values', () => {
    const groups = createTimezoneGroups(t);
    const options = groups.flatMap((group) => group.items);

    for (const option of options) {
      // A label equal to the value would mean the raw IANA id leaks into the
      // UI; a value equal to the old localized label would reintroduce the bug.
      expect(option.label).not.toBe(option.value);
    }
  });
});
