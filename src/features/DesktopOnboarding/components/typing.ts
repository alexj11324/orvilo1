export interface TypingState {
  phase: 'typing' | 'pause' | 'deleting' | 'gap';
  sentence: number;
  visible: number;
}
export const initialTypingState: TypingState = { sentence: 0, visible: 0, phase: 'typing' };
export const sentenceSegments = (sentence: string): string[] => {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return [...segmenter.segment(sentence)].map((part) => part.segment);
};
export function advanceTyping(state: TypingState, lengths: number[]): TypingState {
  if (!lengths.length) return initialTypingState;
  const sentence = state.sentence % lengths.length;
  const count = lengths[sentence];
  if (state.phase === 'typing') {
    const visible = Math.min(count, state.visible + 1);
    return { sentence, visible, phase: visible === count ? 'pause' : 'typing' };
  }
  if (state.phase === 'pause') return { sentence, visible: count, phase: 'deleting' };
  if (state.phase === 'deleting') {
    const visible = Math.max(0, state.visible - 1);
    return { sentence, visible, phase: visible === 0 ? 'gap' : 'deleting' };
  }
  return { sentence: (sentence + 1) % lengths.length, visible: 0, phase: 'typing' };
}
