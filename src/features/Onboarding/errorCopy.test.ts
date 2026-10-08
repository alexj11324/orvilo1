import { describe, expect, it } from 'vitest';

import { resolveOnboardingErrorCopy } from './errorCopy';

describe('resolveOnboardingErrorCopy', () => {
  it.each(['workspace', 'agent', 'selection', 'finish'] as const)(
    'names the %s action instead of a generic load failure',
    (action) => {
      expect(resolveOnboardingErrorCopy(action, new Error('boom'))).toEqual({
        descriptionKey: `setup.error.${action}.description`,
        titleKey: `setup.error.${action}.title`,
      });
    },
  );

  it('keeps the shared sign-in and permission copy for auth failures', () => {
    expect(resolveOnboardingErrorCopy('workspace', { data: { httpStatus: 401 } })).toBeUndefined();
    expect(resolveOnboardingErrorCopy('agent', { data: { code: 'FORBIDDEN' } })).toBeUndefined();
  });

  it('treats a server error on a write as an action failure', () => {
    expect(resolveOnboardingErrorCopy('finish', { status: 500 })?.titleKey).toBe(
      'setup.error.finish.title',
    );
  });
});
