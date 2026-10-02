import { describe, expect, it } from 'vitest';

import { decodeTopicListCursor, encodeTopicListCursor } from '../topic';

describe('topic list cursor', () => {
  it('round-trips an `updatedAt|id` pair, microseconds intact', () => {
    const cursor = encodeTopicListCursor('2026-10-02 12:00:00.123456+00', 'tpc_abc');

    expect(decodeTopicListCursor(cursor)).toEqual({
      id: 'tpc_abc',
      updatedAt: '2026-10-02 12:00:00.123456+00',
    });
  });

  it('splits on the LAST `|` — topic ids never contain it, timestamps never will', () => {
    const cursor = encodeTopicListCursor('2026-10-02T12:00:00.123Z', 'tpc_x');

    expect(decodeTopicListCursor(cursor)?.id).toBe('tpc_x');
  });

  it('rejects malformed input instead of throwing — a bad cursor falls back to page one', () => {
    expect(decodeTopicListCursor(undefined)).toBeNull();
    expect(decodeTopicListCursor('')).toBeNull();
    expect(decodeTopicListCursor('no-separator')).toBeNull();
    expect(decodeTopicListCursor('|only-id')).toBeNull();
    expect(decodeTopicListCursor('not-a-date|tpc_x')).toBeNull();
    expect(decodeTopicListCursor('2026-10-02 12:00:00|')).toBeNull();
  });
});
