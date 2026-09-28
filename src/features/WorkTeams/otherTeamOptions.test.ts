import { describe, expect, it } from 'vitest';

import { otherTeamOptions } from './otherTeamOptions';

describe('otherTeamOptions', () => {
  it('omits the current team so triage cannot transfer onto itself', () => {
    expect(
      otherTeamOptions(
        [
          { id: 'eng', name: 'Engineering' },
          { id: 'design', name: 'Design' },
        ],
        'eng',
      ),
    ).toEqual([{ label: 'Design', value: 'design' }]);
  });
});
