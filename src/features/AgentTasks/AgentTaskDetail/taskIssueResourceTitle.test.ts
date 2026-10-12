import { describe, expect, it } from 'vitest';

import { resolveResourceTitleChange } from './taskIssueResourceTitle';

describe('resolveResourceTitleChange', () => {
  it('saves a trimmed, different title', () => {
    expect(resolveResourceTitleChange('Desing', '  Design ')).toBe('Design');
  });

  it('has nothing to save for an empty or unchanged title', () => {
    expect(resolveResourceTitleChange('Design', '   ')).toBeUndefined();
    expect(resolveResourceTitleChange('Design', 'Design ')).toBeUndefined();
  });
});
