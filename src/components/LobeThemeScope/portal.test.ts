// @vitest-environment happy-dom
import './installStyleLayer';

import { LOBE_THEME_APP_ID, useAppElement } from '@lobehub/ui';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import LobeThemeScope from './index';

let appElement: HTMLElement | null = null;
const PortalProbe = () => {
  appElement = useAppElement();
  return null;
};

let container: HTMLDivElement | undefined;
afterEach(() => {
  container?.remove();
  appElement = null;
});

const mount = async () => {
  container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(LobeThemeScope, null, createElement(PortalProbe)));
  });
  return root;
};

describe('LobeThemeScope portal host', () => {
  it('gives lobehub portals (useAppElement) a host inside the scope class', async () => {
    const root = await mount();

    expect(appElement).toBeInstanceOf(HTMLElement);
    expect(appElement!.hasAttribute('data-lobe-portal-host')).toBe(true);
    expect(appElement!.closest('.orvilo-editor-scope')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('keeps the LOBE_THEME_APP_ID element the editor toolbars query inside the scope', async () => {
    const root = await mount();
    const appRoot = document.getElementById(LOBE_THEME_APP_ID);

    expect(appRoot).not.toBeNull();
    expect(appRoot!.closest('.orvilo-editor-scope')).not.toBeNull();

    await act(async () => root.unmount());
  });
});
