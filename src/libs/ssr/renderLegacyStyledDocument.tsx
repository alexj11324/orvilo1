import { createCache } from '@ant-design/cssinjs';
import { buildInlineAntdStyle } from '@lobehub/ui/static-css/runtime';
import { extractStaticStyle, StyleProvider } from 'antd-style';
import type { ReactNode } from 'react';
import { renderToReadableStream } from 'react-dom/server';

/** Explicit compatibility owner for retained SDK theme/SSR style consumers.
 * Request-local cache and full render completion are required: removing this
 * before those consumers migrate loses their first-paint CSS. */
export async function renderLegacyStyledDocument(
  children: ReactNode,
  options: Parameters<typeof buildInlineAntdStyle>[1] & { onError: (error: unknown) => void },
) {
  const cache = createCache();
  const stream = await renderToReadableStream(
    <StyleProvider cache={cache} speedy={false}>
      {children}
    </StyleProvider>,
    { onError: options.onError },
  );
  await stream.allReady;
  const html = await new Response(stream).text();
  const inline = buildInlineAntdStyle(cache, options);
  const emotion = extractStaticStyle(html, { includeAntd: false })
    .map((item) => item.tag)
    .join('');
  return {
    html: html.replace('</head>', `${inline.html}${emotion}</head>`),
    uncoveredStyles: inline.uncovered.length,
  };
}
