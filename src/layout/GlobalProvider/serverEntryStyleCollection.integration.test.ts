// @vitest-environment node

import '../../../apps/auth/app/virtual-modules.d.ts';

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ThemeContext } from '@emotion/react';
import { MaskShadow, ThemeProvider } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { createElement, use } from 'react';
import type { EntryContext } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderNativeDocument } from '@/libs/ssr/renderNativeDocument';
import { type NativeThemeOptions, resolveNativeTheme } from '@/styles/nativeTheme';
import { neutralColors, primaryColors } from '@/styles/nativeThemeSwatches';

import handleAuthRequest from '../../../apps/auth/app/entry.server';
import handleShareRequest from '../../../apps/share/app/entry.server';
import ShareAppShell from '../../../apps/share/src/shell/ShareAppShell';
import handleWorkbenchRequest from '../../../apps/workbench/app/entry.server';
import WorkbenchShell from '../../../apps/workbench/src/shell/WorkbenchShell';
import AntdStyleLayer from './AntdStyleLayer';
import { NativeThemeProvider } from './NativeThemeProvider';

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
      createElement(
        ThemeProvider,
        {
          appId: 'nested-layered-sdk-app',
          appearance: 'light',
          enableCustomFonts: false,
          enableGlobalStyle: false,
          theme: {
            cssVar: { key: 'nested-layered-sdk-fixture' },
            token: { colorPrimary: renderState.primary },
          },
        },
        'actual retained layered SDK app',
      ),
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
      expect(html).toContain('actual retained layered SDK app');
      expect(html).toContain('ant-app');
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
      // This belongs to the real nested SDK app fixture; Share/Workbench shells
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

// A real SSR leaf reads the same Emotion context as the existing ThemeRoles.
// No theme/token algorithm, provider, store or renderer is mocked here.
function ResolvedSDKThemeReceipt({
  receive,
}: {
  receive: (theme: Record<string, unknown>) => void;
}) {
  receive(Object.fromEntries(Object.entries(use(ThemeContext))));
  return createElement('main', { 'data-resolved-sdk-theme': '' }, 'actual resolved SDK theme');
}

async function renderSDKThemeReceipt(options: NativeThemeOptions) {
  let resolved: Record<string, unknown> | undefined;
  const html = await renderNativeDocument(
    createElement(
      'html',
      { lang: 'en-US' },
      createElement('head', null, createElement('title', null, 'Resolved theme receipt')),
      createElement(
        'body',
        null,
        createElement(
          ThemeProvider,
          {
            appearance: options.appearance,
            defaultAppearance: options.appearance,
            defaultThemeMode: options.appearance,
            enableCustomFonts: false,
            enableGlobalStyle: false,
            customTheme: { primaryColor: options.primaryColor, neutralColor: options.neutralColor },
            theme: {
              components: { Popover: { zIndexPopup: 1300 } },
              cssVar: { key: 'orvilo-parity-vars' },
              token: {
                fontFamily: options.fontFamily,
                fontFamilyCode: options.fontFamilyCode,
                motion: options.animationMode !== 'disabled',
                motionUnit: options.animationMode === 'agile' ? 0.05 : 0.1,
              },
            },
          },
          createElement(ResolvedSDKThemeReceipt, {
            receive: (value) => {
              resolved = value;
            },
          }),
        ),
      ),
    ),
    (error) => {
      throw error;
    },
  );
  expect(html).toContain('<!DOCTYPE html><html lang="en-US">');
  expect(html).toContain('actual resolved SDK theme');
  expect(html).toContain('</body></html>');
  expect(resolved).toBeDefined();
  return resolved;
}

describe('actual installed SDK resolved-theme parity before default semantic cutover', () => {
  const fonts = { fontFamily: 'Parity document font', fontFamilyCode: 'Parity code font' };
  // The default palette names are not persisted UserPrimary/NeutralColor values.
  // Enumerate the actual persisted options without introducing invalid gray/primary values.
  for (const appearance of ['light', 'dark'] as const) {
    it(`${appearance}: compares every one of 72 fields for the full legal primary/neutral matrix`, async () => {
      let cases = 0;
      for (const primaryColor of [
        undefined,
        'blue',
        'cyan',
        'geekblue',
        'gold',
        'green',
        'lime',
        'magenta',
        'orange',
        'purple',
        'red',
        'volcano',
        'yellow',
      ] as const) {
        for (const neutralColor of [
          undefined,
          'mauve',
          'olive',
          'sage',
          'sand',
          'slate',
        ] as const) {
          const options = {
            ...fonts,
            appearance,
            primaryColor,
            neutralColor,
            animationMode: 'elegant',
          } as const;
          const native = resolveNativeTheme(options);
          const actual = await renderSDKThemeReceipt(options);
          const keys = Object.keys(native);
          expect(keys).toHaveLength(72);
          expect(native, JSON.stringify(options)).toEqual(
            Object.fromEntries(keys.map((key) => [key, actual?.[key]])),
          );
          cases += 1;
        }
      }
      expect(cases).toBe(
        (Object.keys(primaryColors).length + 1) * (Object.keys(neutralColors).length + 1),
      );
    }, 60_000);

    for (const animationMode of ['agile', 'disabled'] as const) {
      it(`${appearance}/${animationMode}: preserves all resolved motion and other fields`, async () => {
        const options = { ...fonts, appearance, animationMode };
        const native = resolveNativeTheme(options);
        const actual = await renderSDKThemeReceipt(options);
        expect(native).toEqual(
          Object.fromEntries(Object.keys(native).map((key) => [key, actual?.[key]])),
        );
      });
    }
  }
});

describe('native complete document SSR output', () => {
  it('keeps parallel request choices independent and emits both first-paint sheets', async () => {
    const render = (primaryColor: 'purple' | 'green', fontFamily: string) =>
      renderNativeDocument(
        createElement(
          'html',
          { lang: 'en-US' },
          createElement('head', null, createElement('title', null, 'Native')),
          createElement(
            'body',
            null,
            createElement(
              NativeThemeProvider,
              { appearance: 'light', primaryColor, fontFamily, fontFamilyCode: 'Geist Mono' },
              createElement(
                'main',
                { className: 'bg-background text-foreground' },
                'Native content',
              ),
            ),
          ),
        ),
        (error) => {
          throw error;
        },
      );
    const [one, two] = await Promise.all([
      render('purple', 'First font'),
      render('green', 'Second font'),
    ]);
    expect(one).toContain('--font-sans: First font');
    expect(one).not.toContain('--font-sans: Second font');
    expect(two).toContain('--font-sans: Second font');
    expect(two).not.toContain('--font-sans: First font');
    for (const html of [one, two]) {
      expect(html).toContain('<!DOCTYPE html><html lang="en-US">');
      expect(html).toContain('<head><title>Native</title>');
      expect(html).toContain('<main class="bg-background text-foreground">Native content</main>');
      expect(html).toContain("html[data-theme='dark']");
      expect(html).toContain("html:not([data-theme='dark'])");
      expect(html).toContain('--background: #f8f8f8');
      expect(html).toContain('--background: #000000');
      expect(html).toContain('data-orvilo-native-theme');
      expect(html).not.toContain('data-emotion=');
      expect(html).toContain('</body></html>');
    }
  });
});
