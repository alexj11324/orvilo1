import type { EntryContext } from 'react-router';
import { ServerRouter } from 'react-router';
import { styleKeys } from 'virtual:aspectlylabs/antd-static-css';

import { renderLegacyStyledDocument } from '@/libs/ssr/renderLegacyStyledDocument';

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  let status = responseStatusCode;
  const rendered = await renderLegacyStyledDocument(
    <ServerRouter context={routerContext} url={request.url} />,
    {
      styleKeys,
      onError: (error) => {
        status = 500;
        console.error(error);
      },
    },
  );

  responseHeaders.set('Content-Type', 'text/html; charset=utf-8');

  return new Response(rendered.html, {
    headers: responseHeaders,
    status,
  });
}
