import { describe, expect, it } from 'vitest';

import {
  coordinatorGateKind,
  coordinatorGateReason,
  coordinatorReasonCopy,
} from './coordinatorCopy';

const decision = (ids: string[]) => ({ options: ids.map((id) => ({ id, label: id })) }) as any;

describe('coordinatorGateKind', () => {
  it('recognizes ordinary task recovery decisions', () => {
    expect(coordinatorGateKind(decision(['retry', 'retire']))).toBe('recoverTask');
  });
});

describe('coordinatorGateReason', () => {
  it('returns non-template questions verbatim', () => {
    expect(coordinatorGateReason('Which dataset should the ablation use?')).toBe(
      'Which dataset should the ablation use?',
    );
  });
});

describe('coordinatorReasonCopy', () => {
  it('passes unknown reasons through as undefined so the raw text renders', () => {
    expect(coordinatorReasonCopy('some future reason')).toBeUndefined();
    expect(coordinatorReasonCopy(undefined)).toBeUndefined();
  });
});
