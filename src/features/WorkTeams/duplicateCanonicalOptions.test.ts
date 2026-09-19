import { describe, expect, it } from 'vitest';

import { duplicateCanonicalOptions } from './duplicateCanonicalOptions';

describe('duplicateCanonicalOptions', () => {
  it('omits the current task so duplicate cannot point at itself', () => {
    expect(
      duplicateCanonicalOptions(
        [
          { id: 'task_a', identifier: 'ENG-1', name: 'Original' },
          { id: 'task_b', identifier: 'ENG-2', name: 'Copy' },
        ],
        'task_b',
      ),
    ).toEqual([{ label: 'Original', value: 'task_a' }]);
  });

  it('omits tasks that are already duplicates so the canonical cannot chain', () => {
    expect(
      duplicateCanonicalOptions(
        [
          { duplicateOfTaskId: null, id: 'task_a', identifier: 'ENG-1', name: 'Original' },
          { duplicateOfTaskId: 'task_a', id: 'task_c', identifier: 'ENG-3', name: 'Also a copy' },
        ],
        'task_b',
      ),
    ).toEqual([{ label: 'Original', value: 'task_a' }]);
  });
});
