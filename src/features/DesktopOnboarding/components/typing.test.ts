import { describe, expect, it } from 'vitest';

import { advanceTyping, initialTypingState, sentenceSegments } from './typing';

describe('onboarding sentence transitions', () => {
  it('keeps combining marks and emoji sequences in single graphemes', () => {
    expect(sentenceSegments('A👨‍👩‍👧‍👦e\u0301')).toEqual(['A', '👨‍👩‍👧‍👦', 'e\u0301']);
  });
  it('completes, pauses, deletes, waits, and loops without losing a sentence', () => {
    let state = advanceTyping(initialTypingState, [1, 2]);
    expect(state).toEqual({ sentence: 0, visible: 1, phase: 'pause' });
    state = advanceTyping(state, [1, 2]);
    expect(state.phase).toBe('deleting');
    state = advanceTyping(state, [1, 2]);
    expect(state).toEqual({ sentence: 0, visible: 0, phase: 'gap' });
    state = advanceTyping(state, [1, 2]);
    expect(state).toEqual({ sentence: 1, visible: 0, phase: 'typing' });
    expect(advanceTyping({ sentence: 1, visible: 0, phase: 'gap' }, [1, 2]).sentence).toBe(0);
  });
  it('keeps empty input bounded and permits empty sentences in the loop', () => {
    expect(advanceTyping(initialTypingState, [])).toEqual(initialTypingState);
    expect(advanceTyping(initialTypingState, [0]).phase).toBe('pause');
  });
});
