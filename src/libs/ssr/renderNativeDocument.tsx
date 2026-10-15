import type { ReactNode } from 'react';
import { renderToReadableStream } from 'react-dom/server';

/** Native hosts render their own semantic style tags in the document tree.
 * There is no CSS-in-JS cache, process-global extraction or SDK import here. */
export async function renderNativeDocument(children: ReactNode, onError: (error: unknown) => void) {
  const stream = await renderToReadableStream(children, { onError });
  await stream.allReady;
  return new Response(stream).text();
}
