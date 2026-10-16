import { describe, expect, it } from 'vitest';

import { pendingChecklistResultIds } from './issueChecklistDecisions';

describe('pendingChecklistResultIds', () => {
  it('keeps accepted decisions and old rounds out of direct batch acceptance', () => {
    const results = [
      { id: 'current', verifyRunId: 'now', verdict: 'passed' },
      { id: 'accepted', verifyRunId: 'now', verdict: 'passed', userDecision: 'accepted' },
      { id: 'pending', verifyRunId: 'now', verdict: null },
      { id: 'old', verifyRunId: 'previous', verdict: 'passed' },
    ];
    expect(pendingChecklistResultIds(results, 'now')).toEqual(['current']);
    expect(pendingChecklistResultIds(results)).toEqual([]);
  });
});
