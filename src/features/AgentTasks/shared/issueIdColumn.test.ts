import { describe, expect, it } from 'vitest';

import { ISSUE_ID_WIDTH_VAR, issueIdColumnStyle } from './issueIdColumn';

describe('issueIdColumnStyle', () => {
  it('sizes the column to the longest identifier', () => {
    expect(issueIdColumnStyle(['ORV-117', 'DAY123-79', 'PMI-1'])).toEqual({
      [ISSUE_ID_WIDTH_VAR]: '9ch',
    });
  });

  it('ignores missing identifiers and leaves an empty list unsized', () => {
    expect(issueIdColumnStyle([undefined, null, 'A-1'])).toEqual({ [ISSUE_ID_WIDTH_VAR]: '3ch' });
    expect(issueIdColumnStyle([])).toBeUndefined();
  });
});
