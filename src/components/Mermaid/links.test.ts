import { describe, expect, it } from 'vitest';

import { getDiagramLinks, resolveDiagramHref } from './links';

describe('diagram navigation isolation', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,evil',
    'file:///etc/passwd',
    'vbscript:evil',
    'javascript:\nalert(1)',
  ])('rejects executable/device URL %s', (href) => {
    expect(resolveDiagramHref(href, 'https://app.example/agent')).toBeUndefined();
  });
  it('preserves a relative application navigation and encoded path', () => {
    expect(resolveDiagramHref('/agent/a%20b?topic=1', 'https://app.example/')).toBe(
      'https://app.example/agent/a%20b?topic=1',
    );
  });
  it('retains trusted link target/rel and treats malicious labels as text', () => {
    expect(
      getDiagramLinks(
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="https://example.com/guide" target="_blank" rel="nofollow"><text>&lt;img src=x onerror=evil&gt;</text></a></svg>',
        'https://app.example/',
      ),
    ).toEqual([
      {
        href: 'https://example.com/guide',
        target: '_blank',
        rel: 'nofollow noopener noreferrer',
        label: '<img src=x onerror=evil>',
      },
    ]);
  });
  it('never exposes script hrefs or internal SVG fragment references', () => {
    expect(
      getDiagramLinks(
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:evil">Attack</a><a href="#node">Jump</a></svg>',
        'https://app.example/',
      ),
    ).toEqual([]);
  });
});
