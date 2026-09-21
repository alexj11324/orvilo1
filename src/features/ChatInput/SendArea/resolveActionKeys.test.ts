import { describe, expect, it } from 'vitest';

import { type ActionKey } from '../ActionBar/config';
import { resolveSendAreaActionKeys } from './resolveActionKeys';

describe('resolveSendAreaActionKeys', () => {
  it('strips contextWindow when a ControlBar hosts it', () => {
    expect(resolveSendAreaActionKeys(['plus', 'contextWindow'] as ActionKey[], true)).toEqual([
      'plus',
    ]);
  });

  it('keeps contextWindow for composers without a ControlBar', () => {
    // Regression for  composers
    // rendered with `showControlBar={false}` (floating panel, mobile) used to
    // drop the token indicator entirely because SendArea always filtered it.
    expect(resolveSendAreaActionKeys(['plus', 'contextWindow'] as ActionKey[], false)).toEqual([
      'plus',
      'contextWindow',
    ]);
  });

  it('omits an active audio control when its action belongs to another region', () => {
    expect(resolveSendAreaActionKeys(['voiceMessage'], true, 'dictation')).toEqual([]);
    expect(resolveSendAreaActionKeys(['voiceMessage'], true, 'voiceMessage')).toEqual([
      'voiceMessage',
    ]);
  });

  it('handles undefined rightActions', () => {
    expect(resolveSendAreaActionKeys(undefined, true)).toEqual([]);
    expect(resolveSendAreaActionKeys(undefined, false)).toEqual([]);
  });
});
