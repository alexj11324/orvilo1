import { describe, expect, it } from 'vitest';

import { preprocessLaTeX, transformCitations } from './plugins';

describe('transformCitations', () => {
  it('links in-range references and leaves code and out-of-range ones alone', () => {
    expect(transformCitations('A [1] B [3] `x[1]`', 2)).toBe(
      'A [#citation-1](citation-1) B [3] `x[1]`',
    );
  });

  it('is a no-op without citations', () => {
    expect(transformCitations('A [1]', 0)).toBe('A [1]');
  });
});

describe('preprocessLaTeX', () => {
  it('converts bracket delimiters outside code', () => {
    expect(preprocessLaTeX('\\[x^2\\] and \\(y\\) `\\(z\\)`')).toBe('$$x^2$$ and $y$ `\\(z\\)`');
  });
});
