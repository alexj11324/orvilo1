import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const SAMPLE_HTML = `<body>
    <div id="loading-screen"></div>
    <div id="root" style="height: 100%"></div>
  </body>`;

// The plugin is coupled to the shape of the real entry document, so the contract
// is asserted against that document rather than only against a fixture: if the
// marker is reshaped, this reads a file the plugin can no longer inject into.
const REAL_INDEX_HTML = readFileSync(
  path.join(import.meta.dirname, '..', '..', 'index.html'),
  'utf8',
);

const loadHandler = async () => {
  const { customBrandingLoadingScreen } = await import('./customBrandingLoadingScreen');
  const plugin = customBrandingLoadingScreen();
  return (plugin.transformIndexHtml as { handler: (html: string) => string }).handler;
};

describe('customBrandingLoadingScreen', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('keeps the default upstream branding untouched', async () => {
    vi.doMock('@orvilo/business-const/branding', () => ({ BRANDING_NAME: 'LobeHub' }));
    const handler = await loadHandler();

    expect(handler(SAMPLE_HTML)).toBe(SAMPLE_HTML);
  });

  it('renders the brand name inside the loading screen', async () => {
    vi.doMock('@orvilo/business-const/branding', () => ({ BRANDING_NAME: 'Orvilo' }));
    const handler = await loadHandler();

    const result = handler(SAMPLE_HTML);
    expect(result).toContain('id="loading-screen"');
    expect(result).toContain('id="loading-brand"');
    expect(result).toContain('>Orvilo</div>');
  });

  it('renders a custom brand name and preserves the rest of the document', async () => {
    vi.doMock('@orvilo/business-const/branding', () => ({ BRANDING_NAME: 'AI Workstation' }));
    const handler = await loadHandler();

    const result = handler(SAMPLE_HTML);
    expect(result).not.toContain('Orvilo');
    expect(result).toContain('AI Workstation');
    expect(result).toContain('<div id="root" style="height: 100%"></div>');
  });

  it('escapes HTML-sensitive characters in the brand name', async () => {
    vi.doMock('@orvilo/business-const/branding', () => ({ BRANDING_NAME: 'A<B>&"C' }));
    const handler = await loadHandler();

    const result = handler(SAMPLE_HTML);
    expect(result).toContain('A&lt;B&gt;&amp;&quot;C');
    expect(result).not.toContain('A<B>');
  });

  it('leaves an entry document without a loading screen alone', async () => {
    vi.doMock('@orvilo/business-const/branding', () => ({ BRANDING_NAME: 'Orvilo' }));
    const handler = await loadHandler();

    const noScreen = '<body><div id="root"></div></body>';
    expect(handler(noScreen)).toBe(noScreen);
  });

  describe('the real index.html', () => {
    it('still carries the marker the plugin injects into', () => {
      expect(REAL_INDEX_HTML).toContain('<div id="loading-screen"></div>');
    });

    it('carries no upstream wordmark or draw-in animation', () => {
      expect(REAL_INDEX_HTML).not.toContain('loading-draw');
      expect(REAL_INDEX_HTML).not.toContain('loading-fill');
      // viewBox of the upstream wordmark that used to be drawn here
      expect(REAL_INDEX_HTML).not.toContain('viewBox="0 0 940 320"');
    });

    it('receives the brand name once the plugin runs on it', async () => {
      vi.doMock('@orvilo/business-const/branding', () => ({ BRANDING_NAME: 'Orvilo' }));
      const handler = await loadHandler();

      const result = handler(REAL_INDEX_HTML);
      expect(result).not.toBe(REAL_INDEX_HTML);
      expect(result).toContain('id="loading-brand"');
      expect(result).toContain('>Orvilo</div>');
    });
  });
});
