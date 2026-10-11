import { describe, expect, it } from 'vitest';

import { isTrpcPreconditionReason } from './trpcError';

describe('isTrpcPreconditionReason', () => {
  it('matches a precondition rejection by its stable reason', () => {
    const error = { data: { code: 'PRECONDITION_FAILED' }, message: 'EXPERTISE_UNAVAILABLE' };

    expect(isTrpcPreconditionReason(error, 'EXPERTISE_UNAVAILABLE')).toBe(true);
  });

  it('reads the reason from the error shape when the message is not on the error itself', () => {
    const error = {
      data: { code: 'PRECONDITION_FAILED' },
      shape: { message: 'TASK_INTENT_UNAVAILABLE' },
    };

    expect(isTrpcPreconditionReason(error, 'TASK_INTENT_UNAVAILABLE')).toBe(true);
  });

  it('does not match another reason or another error code', () => {
    expect(
      isTrpcPreconditionReason(
        { data: { code: 'PRECONDITION_FAILED' }, message: 'ACP_JUDGMENT_NO_BINDING' },
        'EXPERTISE_UNAVAILABLE',
      ),
    ).toBe(false);
    expect(
      isTrpcPreconditionReason(
        { data: { code: 'INTERNAL_SERVER_ERROR' }, message: 'EXPERTISE_UNAVAILABLE' },
        'EXPERTISE_UNAVAILABLE',
      ),
    ).toBe(false);
    expect(isTrpcPreconditionReason(new Error('offline'), 'EXPERTISE_UNAVAILABLE')).toBe(false);
    expect(isTrpcPreconditionReason(undefined, 'EXPERTISE_UNAVAILABLE')).toBe(false);
  });
});
