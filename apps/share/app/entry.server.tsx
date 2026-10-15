import { renderToReadableStream } from 'react-dom/server';
import type { EntryContext } from 'react-router';
import { ServerRouter } from 'react-router';

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  let status = responseStatusCode;

  const stream = await renderToReadableStream(
    <ServerRouter context={routerContext} url={request.url} />,
    {
      onError(error) {
        status = 500;
        console.error(error);
      },
    },
  );

  // Keep the whole document buffered so a render error still sets the status.
  await stream.allReady;

  responseHeaders.set('Content-Type', 'text/html; charset=utf-8');

  return new Response(stream, {
    headers: responseHeaders,
    status,
  });
}
