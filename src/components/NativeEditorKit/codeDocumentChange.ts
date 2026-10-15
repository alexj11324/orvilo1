/** The smallest contiguous edit between exact UTF-16 documents. Avoid splitting
 * surrogate pairs so CodeMirror positions remain valid at emoji boundaries. */
export function nativeCodeDocumentChange(
  previous: string,
  next: string,
): { from: number; to: number; insert: string } | undefined {
  if (previous === next) return;
  let from = 0;
  const limit = Math.min(previous.length, next.length);
  while (from < limit && previous[from] === next[from]) from += 1;
  if (
    from > 0 &&
    from < previous.length &&
    previous.charCodeAt(from) >= 0xdc00 &&
    previous.charCodeAt(from) <= 0xdfff
  )
    from -= 1;
  let previousEnd = previous.length;
  let nextEnd = next.length;
  while (previousEnd > from && nextEnd > from && previous[previousEnd - 1] === next[nextEnd - 1]) {
    previousEnd -= 1;
    nextEnd -= 1;
  }
  if (
    previousEnd < previous.length &&
    previousEnd > from &&
    previous.charCodeAt(previousEnd) >= 0xdc00 &&
    previous.charCodeAt(previousEnd) <= 0xdfff
  ) {
    previousEnd += 1;
    nextEnd += 1;
  }
  return { from, to: previousEnd, insert: next.slice(from, nextEnd) };
}
