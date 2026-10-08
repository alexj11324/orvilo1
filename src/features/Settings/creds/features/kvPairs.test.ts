import { describe, expect, it } from 'vitest';

import { isHalfFilledPair, pairCompletenessRule, pairsToValues } from './kvPairs';

describe('isHalfFilledPair', () => {
  it('flags a row with only one side filled', () => {
    expect(isHalfFilledPair({ key: 'API_KEY', value: '' })).toBe(true);
    expect(isHalfFilledPair({ key: '', value: 'secret' })).toBe(true);
  });

  it('accepts complete and fully empty rows', () => {
    expect(isHalfFilledPair({ key: 'API_KEY', value: 'secret' })).toBe(false);
    expect(isHalfFilledPair({ key: '', value: '' })).toBe(false);
    expect(isHalfFilledPair(undefined)).toBe(false);
  });
});

describe('pairsToValues', () => {
  it('keeps complete rows and skips empty ones', () => {
    expect(
      pairsToValues([
        { key: 'A', value: '1' },
        { key: '', value: '' },
        { key: 'B', value: '2' },
      ]),
    ).toEqual({ A: '1', B: '2' });
  });

  it('tolerates a missing list', () => {
    expect(pairsToValues(undefined)).toEqual({});
  });
});

describe('pairCompletenessRule', () => {
  const run = (pair: { key: string; value: string }, current: string) => {
    const rule = pairCompletenessRule(1, 'incomplete') as (form: {
      getFieldValue: (path: Array<number | string>) => unknown;
    }) => { validator: (rule: unknown, value: string) => Promise<void> };
    const getFieldValue = (path: Array<number | string>) =>
      path.join('.') === 'kvPairs.1' ? pair : undefined;
    return rule({ getFieldValue }).validator({}, current);
  };

  it('rejects an empty field whose sibling is filled', async () => {
    await expect(run({ key: 'API_KEY', value: '' }, '')).rejects.toThrow('incomplete');
    await expect(run({ key: '', value: 'secret' }, '')).rejects.toThrow('incomplete');
  });

  it('passes when the field itself is filled or the whole row is empty', async () => {
    await expect(run({ key: 'API_KEY', value: 'secret' }, 'secret')).resolves.toBeUndefined();
    await expect(run({ key: '', value: '' }, '')).resolves.toBeUndefined();
  });
});
