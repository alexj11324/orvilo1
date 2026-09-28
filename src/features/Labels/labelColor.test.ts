import { describe, expect, it } from 'vitest';

import {
  hashLabelName,
  LABEL_DOT_PALETTE,
  labelPaletteColor,
  partitionLabelChips,
  resolveLabelColor,
} from './labelColor';

describe('hashLabelName', () => {
  it('is deterministic', () => {
    expect(hashLabelName('Platform')).toBe(hashLabelName('Platform'));
  });

  it('is case- and order-sensitive (anagrams do not collide)', () => {
    expect(hashLabelName('Bug')).not.toBe(hashLabelName('gBu'));
    expect(hashLabelName('Backend')).not.toBe(hashLabelName('backend'));
  });

  it('handles unicode names', () => {
    expect(Number.isInteger(hashLabelName('平台'))).toBe(true);
    expect(hashLabelName('平台')).toBeGreaterThanOrEqual(0);
  });
});

describe('labelPaletteColor', () => {
  it('returns a palette member', () => {
    expect(LABEL_DOT_PALETTE).toContain(labelPaletteColor('Platform'));
  });

  it('is stable for the same name regardless of surrounding whitespace', () => {
    expect(labelPaletteColor('  Platform  ')).toBe(labelPaletteColor('Platform'));
  });

  it('covers several palette slots across the seeded label names', () => {
    // T16 seed names — a healthy spread is what keeps rows scannable.
    const names = ['Platform', 'Backend', 'Launch', 'Migration', 'Tooling'];
    const distinct = new Set(names.map(labelPaletteColor));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('falls back to the gray slot for empty names', () => {
    expect(labelPaletteColor('')).toBe(LABEL_DOT_PALETTE.at(-1));
    expect(labelPaletteColor('   ')).toBe(LABEL_DOT_PALETTE.at(-1));
  });
});

describe('resolveLabelColor', () => {
  it('prefers an explicit colour', () => {
    expect(resolveLabelColor('Platform', '#123456')).toBe('#123456');
  });

  it('derives from the name when colour is missing or blank', () => {
    expect(resolveLabelColor('Platform', null)).toBe(labelPaletteColor('Platform'));
    expect(resolveLabelColor('Platform', '  ')).toBe(labelPaletteColor('Platform'));
  });
});

describe('partitionLabelChips', () => {
  const labels = ['a', 'b', 'c', 'd'];

  it('shows every label when the list fits', () => {
    expect(partitionLabelChips(labels, 4)).toEqual({ overflow: [], visible: labels });
    expect(partitionLabelChips(labels, 10).visible).toHaveLength(4);
  });

  it('collapses the tail behind overflow when the list exceeds max', () => {
    expect(partitionLabelChips(labels, 2)).toEqual({
      overflow: ['c', 'd'],
      visible: ['a', 'b'],
    });
  });

  it('collapses everything when max is below 1', () => {
    expect(partitionLabelChips(labels, 0)).toEqual({ overflow: labels, visible: [] });
  });

  it('does not mutate the input', () => {
    const input = ['x', 'y'];
    partitionLabelChips(input, 1);
    expect(input).toEqual(['x', 'y']);
  });
});
