// @vitest-environment node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ColorSwatches, MaskShadow, ThemeProvider } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { createElement } from 'react';
import type { EntryContext } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import handleAuthRequest from '../../../apps/auth/app/entry.server';
import handleShareRequest from '../../../apps/share/app/entry.server';
import ShareAppShell from '../../../apps/share/src/shell/ShareAppShell';
import handleWorkbenchRequest from '../../../apps/workbench/app/entry.server';
import WorkbenchShell from '../../../apps/workbench/src/shell/WorkbenchShell';
import AntdStyleLayer from './AntdStyleLayer';

const renderState = vi.hoisted(() => ({ primary: '#123456', request: 0 }));

// Only the route-page boundary is replaced. Share/Workbench mount their real
// owned shell/locale/theme code; actual handlers, SDK engines, React stream and
// collectors are never mocked. Auth keeps the original simple SDK page fixture.
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ServerRouter: ({ url }: { url: string }) => createElement(SSRPage, { url }),
}));

function StyledMarker() {
  // Use the public static API with request-specific values, not a createStyles
  // hook. The real collector filters registered classes against response HTML.
  const styles = createStaticStyles(({ css, cssVar }) => ({
    marker: css`
      padding-inline-start: 17px;
      border: 3px solid ${renderState.primary};
      color: ${cssVar.colorText};
      background-color: ${cssVar.colorPrimary};
    `,
  }));
  return createElement(
    'div',
    { 'className': styles.marker, 'data-ssr-style-marker': renderState.request },
    createElement(MaskShadow, { position: 'bottom', size: 17 }, 'actual server style consumer'),
    // A genuine nested layered SDK consumer has rules absent from the apps'
    // unlayered static manifest, so the real handler must emit its fallback CSS.
    createElement(
      AntdStyleLayer,
      null,
      createElement(ColorSwatches, {
        colors: [{ color: renderState.primary, title: 'actual retained SDK color' }],
        enableColorPicker: true,
        texts: { custom: 'actual retained SDK color picker' },
      }),
    ),
  );
}

function SSRPage({ url }: { url: string }) {
  const shell = new URL(url).pathname.slice(1);
  const content =
    shell === 'share'
      ? createElement(
          ShareAppShell,
          {
            locale: 'en-US',
            resources: { chat: {}, error: {}, pageShare: {} },
            serverConfig: null,
          },
          createElement(StyledMarker),
        )
      : shell === 'workbench'
        ? createElement(
            WorkbenchShell,
            { locale: 'en-US', resources: { verify: {} } },
            createElement(StyledMarker),
          )
        : createElement(
            AntdStyleLayer,
            null,
            createElement(
              ThemeProvider,
              {
                appearance: 'light',
                enableCustomFonts: false,
                enableGlobalStyle: false,
                theme: {
                  cssVar: { key: 'ssr-public-provider-fixture' },
                  token: { colorPrimary: renderState.primary },
                },
              },
              createElement(StyledMarker),
            ),
          );
  return createElement(
    'html',
    null,
    createElement('head', null, createElement('title', null, 'SSR style fixture')),
    createElement('body', null, content),
  );
}

const handlers = [
  { handler: handleAuthRequest, name: 'auth', uncoveredHeader: undefined },
  { handler: handleShareRequest, name: 'share', uncoveredHeader: 'x-share-antd-uncovered' },
  {
    handler: handleWorkbenchRequest,
    name: 'workbench',
    uncoveredHeader: 'x-workbench-antd-uncovered',
  },
] as const;

const requestHTML = async (handler: typeof handleAuthRequest, name: string) => {
  const headers = new Headers({ 'x-fixture-original': 'preserved' });
  // ServerRouter is the mocked page boundary and never reads this router state.
  const response = await handler(
    new Request(`https://fixture.invalid/${name}`),
    207,
    headers,
    {} as EntryContext,
  );
  const html = await response.text();
  const headEnd = html.indexOf('</head>');
  expect(headEnd).toBeGreaterThan(0);
  const head = html.slice(0, headEnd);
  const marker = html.match(/<div[^>]*data-ssr-style-marker="[^"]+"[^>]*>/)?.[0];
  expect(marker).toBeDefined();
  const className = marker?.match(/class="([^"]+)"/)?.[1];
  expect(className).toBeTruthy();
  return { className: className!, head, html, response };
};

const recordResponse = async (
  caseName: string,
  result: Awaited<ReturnType<typeof requestHTML>>,
) => {
  const directory = process.env.ORVILO_SSR_INTEGRATION_RECEIPT_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${caseName}.html`), result.html, { mode: 0o600 });
  await writeFile(
    path.join(directory, `${caseName}.json`),
    JSON.stringify(
      {
        className: result.className,
        headers: Object.fromEntries([...result.response.headers.entries()].sort()),
        status: result.response.status,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
};

describe('actual SSR entries and real Share/Workbench shells retain style output', () => {
  beforeEach(() => {
    renderState.primary = '#123456';
    renderState.request += 1;
  });

  for (const { handler, name, uncoveredHeader } of handlers) {
    it(`${name}: emits actual public static and SDK CSS with Antd vars in the completed head`, async () => {
      const result = await requestHTML(handler, name);
      const { className, head, html, response } = result;
      await recordResponse(`${name}-initial`, result);
      expect(response.status).toBe(207);
      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(response.headers.get('x-fixture-original')).toBe('preserved');
      expect(html).toContain('actual server style consumer');
      expect(head).toContain('data-emotion=');
      expect(head).toContain(`.${className}`);
      expect(head).toContain('padding-inline-start:17px');
      expect(head).toMatch(/mask-image:\s*linear-gradient\(\s*180deg/);
      expect(head).toContain('--mask-shadow-size');
      expect(head).toContain('scrollbar-width:none');
      expect(html).toContain('--mask-shadow-size:17%');
      expect(head).toContain('data-rc-order="prepend"');
      expect(head).toContain('--ant-color-primary');
      expect(head).toContain(renderState.primary);
      // This belongs to the real nested picker fixture; Share/Workbench shells
      // retain their own existing layer semantics.
      expect(head).toContain('@layer antd');
      if (uncoveredHeader) expect(Number(response.headers.get(uncoveredHeader))).toBeGreaterThan(0);
    });

    it(`${name}: collects a subsequent request's actual changed static Emotion rule`, async () => {
      const first = await requestHTML(handler, name);
      await recordResponse(`${name}-update-before`, first);
      renderState.primary = '#654321';
      renderState.request += 1;
      const second = await requestHTML(handler, name);
      await recordResponse(`${name}-update-after`, second);
      expect(second.className).not.toBe(first.className);
      expect(second.head).toContain(`.${second.className}`);
      expect(second.head).toContain('border:3px solid #654321');
      expect(second.head).not.toContain('border:3px solid #123456');
      expect(second.head).not.toContain(`.${first.className}`);
      expect(second.html).toContain(`data-ssr-style-marker="${renderState.request}"`);
    });
  }
});
