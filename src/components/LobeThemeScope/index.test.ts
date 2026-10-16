// @vitest-environment node
// Keep first, like the client entries: vendor modules below insert rules on import.
import './installStyleLayer';

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createCache, extractStyle, StyleProvider } from '@ant-design/cssinjs';
import { styleManager } from 'antd-style';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { layerEmotionCache } from '@/styles/layerEmotionCache';

import LobeThemeScope from './index';

const insertedVendorCss = () =>
  Object.values(styleManager.cache.inserted).filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );

const renderScope = () => {
  const cache = createCache();
  const html = renderToString(
    createElement(
      StyleProvider,
      { cache },
      createElement(
        LobeThemeScope,
        null,
        createElement('a', { 'data-probe': '', 'href': '#x' }, 'probe'),
      ),
    ),
  );
  return { antdCss: extractStyle(cache, { plain: true }), html };
};

describe('LobeThemeScope', () => {
  it('renders the vendor tree, its portal host and the --ant-* aliases inside the scope class', () => {
    const { html } = renderScope();

    expect(html).toMatch(/class="[^"]*orvilo-editor-scope[^"]*"[^>]*style="[^"]*display:contents/);
    const scopeStart = html.indexOf('orvilo-editor-scope');
    expect(html.indexOf('id="lobe-ui-theme-app"')).toBeGreaterThan(scopeStart);
    expect(html.indexOf('data-lobe-portal-host')).toBeGreaterThan(scopeStart);
    expect(html.indexOf('data-probe')).toBeGreaterThan(scopeStart);
    expect(html).toContain('.orvilo-editor-scope {');
    expect(html).toContain('--ant-color-text: var(--foreground);');
  });

  it('collapses nested scopes into the outermost provider stack', () => {
    const html = renderToString(
      createElement(
        LobeThemeScope,
        null,
        createElement(LobeThemeScope, null, createElement('span', { 'data-inner': '' })),
      ),
    );

    expect(html.match(/orvilo-editor-scope/g)?.length).toBe(
      renderToString(createElement(LobeThemeScope)).match(/orvilo-editor-scope/g)?.length,
    );
    expect(html.match(/id="lobe-ui-theme-app"/g)).toHaveLength(1);
    expect(html).toContain('data-inner');
  });

  it('keeps antd cssinjs, including its link reset, inside @layer antd', () => {
    const { antdCss } = renderScope();
    const unlayered = antdCss.replaceAll(/@layer antd\{(?:[^{}]|\{[^{}]*\})*\}/g, '');

    expect(antdCss).toContain('@layer antd');
    expect(unlayered).not.toMatch(/a:where\([^)]*\)[^{]*\{/);
  });

  it('layers and scopes every vendor emotion rule written after the entry patch', () => {
    expect(layerEmotionCache(styleManager.cache)).toBe('already-patched');
    renderScope();

    const rules = insertedVendorCss();
    expect(rules.length).toBeGreaterThan(0);
    let scopedClassRules = 0;
    for (const rule of rules) {
      expect(rule.slice(0, 120)).toMatch(/^@layer antd-style\{/);
      // Class rules cannot match outside the scope; selector-less sheets
      // (keyframes, :root variables, lobehub layers) are only layered.
      const classSelectors = (rule.match(/[^{}]+(?=\{)/g) ?? []).filter((selector) =>
        /(?:^|[\s,>+~])\.(?:acss|css)-/.test(selector),
      );
      for (const selector of classSelectors) {
        expect(selector).toContain(':where(.orvilo-editor-scope) ');
        scopedClassRules += 1;
      }
    }
    expect(scopedClassRules).toBeGreaterThan(10);
  });

  it('orders the runtime vendor layers below Tailwind components and utilities', () => {
    const css = readFileSync(path.resolve(import.meta.dirname, '../../app/globals.css'), 'utf8');
    const order = css
      .match(/@layer ([\w\s,-]+);/)![1]
      .split(',')
      .map((name) => name.trim());

    expect(css.search(/^@layer theme/m)).toBeLessThan(css.search(/^@import/m));
    for (const vendor of ['antd', 'antd-style']) {
      expect(order.indexOf(vendor)).toBeGreaterThan(-1);
      expect(order.indexOf(vendor)).toBeLessThan(order.indexOf('components'));
      expect(order.indexOf(vendor)).toBeLessThan(order.indexOf('utilities'));
    }
  });
});
