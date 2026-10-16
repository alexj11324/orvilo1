import { describe, expect, it } from 'vitest';

import { buildHtmlPreviewSrcDoc, isFullHtmlDocument, isHtmlContentClosed } from './srcDoc';

describe('HTML preview helpers', () => {
  it('detects full documents only', () => {
    expect(isFullHtmlDocument('<!DOCTYPE html><html></html>')).toBe(true);
    expect(isFullHtmlDocument('<HTML lang="en">')).toBe(true);
    expect(isFullHtmlDocument('<div>fragment</div>')).toBe(false);
    expect(isFullHtmlDocument(undefined)).toBe(false);
  });

  it('detects a closed document', () => {
    expect(isHtmlContentClosed('<html><body></body></html>')).toBe(true);
    expect(isHtmlContentClosed('<html><body>')).toBe(false);
  });

  it('injects the storage shim into the existing head', () => {
    const doc = buildHtmlPreviewSrcDoc('<html><head><title>t</title></head><body></body></html>');

    expect(doc.indexOf('localStorage')).toBeGreaterThan(doc.indexOf('<head>'));
    expect(doc.indexOf('localStorage')).toBeLessThan(doc.indexOf('<title>'));
  });

  it('wraps fragments in a document', () => {
    expect(buildHtmlPreviewSrcDoc('<p>x</p>')).toMatch(
      /^<!DOCTYPE html><html><head>.*<body><p>x<\/p><\/body><\/html>$/s,
    );
  });
});
