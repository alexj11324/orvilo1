import { createCache, extractStyle, StyleProvider } from '@ant-design/cssinjs';
import { App } from 'antd';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AntdStyleLayer from './AntdStyleLayer';

// Drop every `@layer antd{...}` block (nesting is at most one level deep).
const stripAntdLayer = (css: string) => css.replaceAll(/@layer antd\{(?:[^{}]|\{[^{}]*\})*\}/g, '');

const extract = (
  wrap: (cache: ReturnType<typeof createCache>) => ReturnType<typeof createElement>,
) => {
  const cache = createCache();
  renderToString(wrap(cache));
  return extractStyle(cache, { plain: true });
};

const linkReset = /a:where\([^)]*\)[^{]*\{/;

describe('AntdStyleLayer', () => {
  it('keeps the antd link reset out of the unlayered cascade', () => {
    // Control: a plain provider leaves `a:where(...)` (color/transition/focus-visible) unlayered.
    const plain = extract((cache) =>
      createElement(StyleProvider, { cache }, createElement(App, null, 'x')),
    );
    expect(stripAntdLayer(plain)).toMatch(linkReset);

    // AntdStyleLayer is `<StyleProvider layer>`; a cache is injected via an outer provider.
    const layered = extract((cache) =>
      createElement(
        StyleProvider,
        { cache },
        createElement(AntdStyleLayer, null, createElement(App, null, 'x')),
      ),
    );
    expect(layered).toContain('@layer antd');
    expect(stripAntdLayer(layered)).not.toMatch(linkReset);
  });
});
