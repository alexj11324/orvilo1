import { describe, expect, it } from 'vitest';

import { parseNativePageResourceEvent } from './useNativePageResourceEvents';

describe('native workspace resource event ingress', () => {
  it('accepts same-account content/lock events without trusting a holder verdict from the payload', () => {
    expect(
      parseNativePageResourceEvent(
        JSON.stringify({
          actorId: 'same-account',
          type: 'lock.changed',
          data: { holderId: 'other-session' },
        }),
      ),
    ).toEqual({ type: 'lock.changed', data: {} });
    expect(parseNativePageResourceEvent('{"type":"doc.updated","actorId":"same-account"}')).toEqual(
      { type: 'doc.updated' },
    );
  });
  it('preserves the root comment identity while rejecting malformed frames', () => {
    expect(
      parseNativePageResourceEvent(
        '{"type":"document.commentsChanged","data":{"rootCommentId":"root"}}',
      ),
    ).toEqual({ type: 'document.commentsChanged', data: { rootCommentId: 'root' } });
    for (const value of [
      '',
      '{',
      'null',
      '{"type":"unknown"}',
      '{"type":"document.commentsChanged","data":{"rootCommentId":42}}',
    ]) {
      expect(parseNativePageResourceEvent(value)).toBeUndefined();
    }
  });
});
