import { describe, expect, it } from 'vitest';

import { escapeXml, unescapeXml } from './xmlEscape';

describe('escapeXml / unescapeXml', () => {
  it('escapes every attribute-breaking character', () => {
    expect(escapeXml('a" /><b>&\'')).toBe('a&quot; /&gt;&lt;b&gt;&amp;&apos;');
  });

  it('round-trips, including text that already looks escaped', () => {
    for (const text of ['plain', 'a" /> <x>', '&lt;', '&amp;lt;', "it's & that"]) {
      expect(unescapeXml(escapeXml(text))).toBe(text);
    }
  });

  it('handles empty input', () => {
    expect(unescapeXml(undefined)).toBe('');
    expect(unescapeXml('')).toBe('');
  });
});
