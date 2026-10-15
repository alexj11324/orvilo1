import { describe, expect, it } from 'vitest';

import {
  buildHtmlPreviewDocument,
  HTML_PREVIEW_MAX_LENGTH,
  htmlPreviewSandbox,
  htmlPreviewState,
} from './document';

describe('native HTML document boundary', () => {
  it('defers scripted documents until generation settles, independent of a closing html token', () => {
    const content =
      '<html><head><script src="https://cdn.example.com/chart.js"></script></head><body><canvas></canvas></body></html>';
    expect(htmlPreviewState(content, true, 'auto')).toBe('deferred');
    expect(htmlPreviewState(content, false, 'auto')).toBe('static');
    expect(htmlPreviewState('<html><body><img onload="draw()">', true, 'auto')).toBe('deferred');
  });
  it('supports sealed-head pure-markup live updates and preserves source-only boundaries', () => {
    expect(
      htmlPreviewState(
        '<html><head><style>p{color:red}</style></head><body><p>Streaming',
        true,
        'auto',
      ),
    ).toBe('live');
    expect(htmlPreviewState('<html><head><style>', true, 'auto')).toBe('deferred');
    expect(htmlPreviewState('<div>Fragment</div>', false, 'auto')).toBe('source');
    expect(htmlPreviewState('<html>' + 'x'.repeat(HTML_PREVIEW_MAX_LENGTH), false, 'auto')).toBe(
      'source',
    );
  });
  it('preserves base URLs, external scripts and authored body while injecting the isolated bridge first', () => {
    const content =
      '<html><head><base href="localfile://session/pages/"><script src="https://cdn.example.com/chart.js"></script></head><body><img src="logo.png"></body></html>';
    const result = buildHtmlPreviewDocument(content, 'frame-token');
    expect(result).toContain('<base href="localfile://session/pages/">');
    expect(result).toContain('<script src="https://cdn.example.com/chart.js"></script>');
    expect(result).toContain('<body><img src="logo.png"></body>');
    expect(result.indexOf('orvilo-html-height')).toBeLessThan(
      result.indexOf('https://cdn.example.com/chart.js'),
    );
  });
  it('rejects privileges that would expose the host and escapes bridge token script terminators', () => {
    expect(() => htmlPreviewSandbox('allow-scripts allow-same-origin')).toThrow();
    expect(htmlPreviewSandbox()).toBe('allow-scripts allow-forms allow-modals');
    const result = buildHtmlPreviewDocument(
      '<html><head></head><body></body></html>',
      '</script><script>alert(1)</script>',
    );
    expect(result).toContain('\\u003c/script>');
    expect(result).not.toContain('token="</script>');
  });
});
