import { cleanup, render, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { generateTheme } from './theme/generate';
import { ThemeRoles, useGeneratedTheme, useResolvedMotionValues } from './themeRoles';

const styleText = () => document.querySelector('style[data-orvilo-theme-roles]')?.textContent ?? '';

describe('ThemeRoles', () => {
  afterEach(cleanup);

  it('publishes the generated roles for the stored accent and base', () => {
    render(
      createElement(ThemeRoles, { appearance: 'dark', neutralColor: 'sage', primaryColor: 'blue' }),
    );
    const { palette, roles } = generateTheme({ accent: 'blue', base: 'sage', mode: 'dark' });
    const css = styleText();
    expect(css).toContain("html[data-theme='dark'], html.dark {");
    expect(css).toContain(`--primary: ${roles.primary};`);
    expect(css).toContain(`--muted-foreground: ${roles['muted-foreground']};`);
    expect(css).toContain(`--palette-yellow-6: ${palette['palette-yellow-6']};`);
  });

  it('scopes light roles away from the dark document', () => {
    render(createElement(ThemeRoles, { appearance: 'light' }));
    expect(styleText()).toContain("html:not([data-theme='dark']):not(.dark) {");
    expect(styleText()).toContain(
      `--background: ${generateTheme({ mode: 'light' }).roles.background};`,
    );
  });

  it('derives motion from the animation mode and stops local motion when disabled', () => {
    const wrapper =
      (animationMode: 'agile' | 'disabled' | 'elegant') =>
      ({ children }: { children: ReactNode }) =>
        createElement(ThemeRoles, { animationMode, appearance: 'light', children });

    expect(
      renderHook(useResolvedMotionValues, { wrapper: wrapper('agile') }).result.current,
    ).toEqual({ durationMid: '0.1s', enabled: true });
    expect(
      renderHook(useResolvedMotionValues, { wrapper: wrapper('elegant') }).result.current,
    ).toEqual({ durationMid: '0.2s', enabled: true });
    cleanup();
    render(createElement(ThemeRoles, { animationMode: 'disabled', appearance: 'light' }));
    expect(styleText()).toMatch(
      /transition: none !important;[\s\S]*@media \(prefers-reduced-motion/,
    );
  });

  it('exposes the generated theme to consumers', () => {
    const { result } = renderHook(useGeneratedTheme, {
      wrapper: ({ children }) =>
        createElement(ThemeRoles, { appearance: 'light', primaryColor: 'red' }, children),
    });
    expect(result.current).toEqual(generateTheme({ accent: 'red', mode: 'light' }));
  });
});
