import { describe, expect, it } from 'vitest';

import { isWorkspaceSlugTakenError } from './workspaceSlugError';

describe('isWorkspaceSlugTakenError', () => {
  it('matches the CONFLICT the workspace router sends for a taken URL', () => {
    expect(
      isWorkspaceSlugTakenError(
        Object.assign(new Error('WORKSPACE_SLUG_TAKEN'), { data: { code: 'CONFLICT' } }),
      ),
    ).toBe(true);
  });

  it.each([
    [
      'another conflict',
      Object.assign(new Error('Invitation already used'), { data: { code: 'CONFLICT' } }),
    ],
    ['the message without the conflict code', new Error('WORKSPACE_SLUG_TAKEN')],
    [
      'a server failure',
      Object.assign(new Error('Failed to create workspace'), {
        data: { code: 'INTERNAL_SERVER_ERROR' },
      }),
    ],
    ['a non-error value', undefined],
  ])('ignores %s', (_, error) => {
    expect(isWorkspaceSlugTakenError(error)).toBe(false);
  });
});
