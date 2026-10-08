// @vitest-environment node
import { createInstance } from 'antd-style';
import { describe, expect, it } from 'vitest';

import { layerEmotionCache, toLayeredInsertArgs } from './layerEmotionCache';

// In node emotion returns the compiled CSS of each insert and keeps it in `inserted`.
const insertedCss = (cache: { inserted: object }) =>
  Object.values(cache.inserted)
    .filter((v): v is string => typeof v === 'string')
    .join('');

describe('toLayeredInsertArgs', () => {
  it('wraps a class rule, including nested at-rules, in the layer', () => {
    const [selector, wrapped] = toLayeredInsertArgs('antd-style', '.acss-abc', {
      name: 'abc',
      styles: 'color:red;@media (min-width:1px){color:blue;}',
    });

    expect(selector).toBe('');
    expect(wrapped.name).toBe('abc');
    expect(wrapped.styles).toBe(
      '@layer antd-style{.acss-abc{color:red;@media (min-width:1px){color:blue;}}}',
    );
  });

  it('leaves selector-less fragments (keyframes, globals) untouched', () => {
    const keyframes = { name: 'k', styles: '@keyframes animation-k{from{opacity:0}to{opacity:1}}' };

    expect(toLayeredInsertArgs('antd-style', '', keyframes)).toEqual(['', keyframes]);
  });
});

describe('layerEmotionCache on a real antd-style instance', () => {
  // antd-style keeps one cache per key, so every test needs its own key.
  let counter = 0;
  const setup = () => {
    const instance = createInstance({ key: `lt-${'abcdefgh'[counter++]}` });
    const result = layerEmotionCache(instance.styleManager.cache);
    return { ...instance, result };
  };

  it('emits class rules, media queries and pseudo selectors inside one layer block each', () => {
    const { createStaticStyles, styleManager, result } = setup();
    expect(result).toBe('patched');

    const styles = createStaticStyles(({ css }) => ({
      box: css`
        color: red;

        &:hover {
          color: blue;
        }

        @media (width >= 600px) {
          color: green;
        }
      `,
    }));

    const out = insertedCss(styleManager.cache);

    expect(styles.box).toMatch(/^lt-[a-z]-/);
    expect(out).toContain(`@layer antd-style{.${styles.box}`);
    expect(out).toContain(`.${styles.box}:hover{color:blue;}`);
    expect(out).toMatch(/@media \(width\s*>=\s*600px\)\{\.lt-[a-z]-\w+\{color:green;\}/);
    // Every top-level rule starts a layer block.
    expect(out.startsWith('@layer antd-style{')).toBe(true);
    expect(out.match(/@layer antd-style\{/g)).toHaveLength(1);
  });

  it('does not wrap @keyframes', () => {
    const { createStaticStyles, keyframes, styleManager } = setup();
    const fade = keyframes`from{opacity:0}to{opacity:1}`;

    createStaticStyles(({ css }) => ({
      anim: css`
        animation: ${fade} 1s;
      `,
    }));

    const entries = Object.values(styleManager.cache.inserted).filter(
      (v): v is string => typeof v === 'string',
    );
    const keyframeEntry = entries.find((css) => css.includes('@keyframes animation-'));
    const classEntry = entries.find((css) => /\.lt-[a-z]-/.test(css));

    // The keyframes rule is emitted bare (no layer); only the class rule that uses it is layered.
    expect(keyframeEntry).toBeDefined();
    expect(keyframeEntry).not.toContain('@layer');
    expect(classEntry).toMatch(/^@layer antd-style\{\.lt-[a-z]-\w+\{.*animation:animation-/);
  });

  it('keeps a literal @keyframes written inside a class rule valid (nested in the layer block)', () => {
    const { createStaticStyles, styleManager } = setup();

    createStaticStyles(({ css }) => ({
      spin: css`
        @keyframes spin-inner {
          to {
            transform: rotate(360deg);
          }
        }

        animation: spin-inner 1s;
      `,
    }));

    expect(insertedCss(styleManager.cache)).toMatch(
      /^@layer antd-style\{\.lt-[a-z]-\w+\{[^}]*\}(@-webkit-keyframes[^]*)?@keyframes spin-inner\{[^]*\}\}$/,
    );
  });

  it('is idempotent and reports late patching', () => {
    const { styleManager } = setup();
    expect(layerEmotionCache(styleManager.cache)).toBe('already-patched');

    const late = createInstance({ key: 'latetest' });
    late.createStaticStyles(({ css }) => ({
      a: css`
        color: red;
      `,
    }));
    expect(layerEmotionCache(late.styleManager.cache)).toBe('late');
  });
});
