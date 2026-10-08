import { URL } from 'node:url';

import debug from 'debug';
import { type NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { authEnv } from '@/envs/auth';
import { createNodeRequest, createNodeResponse } from '@/libs/oidc-provider/http-adapter';
import { getOIDCProvider } from '@/server/services/oidc/oidcProvider';

const log = debug('orvilo-oidc:route'); // Create a debug instance with a namespace

const handler = async (req: NextRequest) => {
  const requestUrl = new URL(req.url);
  log('Received request: %s %s', req.method, requestUrl.pathname);
  log('Path: %s, Pathname: %s', requestUrl.pathname, requestUrl.pathname);

  // Declare the response collector
  let responseCollector;

  try {
    if (!authEnv.ENABLE_OIDC) {
      log('OIDC is not enabled');
      return new NextResponse('OIDC is not enabled', { status: 404 });
    }

    // Get the OIDC Provider instance
    const provider = await getOIDCProvider();

    log(`Calling provider.callback() for ${req.method}`); // Log the method
    await new Promise<void>((resolve, reject) => {
      // <-- Make promise callback async
      let middleware: any;
      try {
        log('Attempting to get middleware from provider.callback()');
        middleware = provider.callback();
        log('Successfully obtained middleware function.');
      } catch (syncError) {
        log('SYNC ERROR during provider.callback()');
        reject(syncError);
        return;
      }

      // Use helper method to create the response collector
      responseCollector = createNodeResponse(resolve);
      const nodeResponse = responseCollector.nodeResponse;

      // Use helper method to create the Node.js request object, now requires await
      createNodeRequest(req).then((nodeRequest) => {
        log('Calling the obtained middleware...');
        middleware(nodeRequest, nodeResponse, (error?: Error) => {
          log('Middleware callback function HAS BEEN EXECUTED.');
          if (error) {
            log('Middleware error reported via callback');
            reject(error);
          } else {
            log(
              'Middleware completed successfully via callback (may be redundant if .end() was called).',
            );
            resolve();
          }
        });
        log('Middleware call initiated, waiting for its callback OR nodeResponse.end()...');
      }, reject);
    });

    log('Promise surrounding middleware call resolved.');

    // Access the final response status
    if (!responseCollector) {
      throw new Error('ResponseCollector was not initialized.');
    }

    const {
      responseStatus: finalStatus,
      responseBody: finalBody,
      responseHeaders: finalHeaders,
    } = responseCollector;

    log('Final Response Status: %d', finalStatus);
    log('Final response header names: %O', Object.keys(finalHeaders));

    return new NextResponse(finalBody, {
      headers: finalHeaders as HeadersInit,
      status: finalStatus,
    });
  } catch (error) {
    // Provider errors can contain credentials. Retain bounded protocol diagnostics
    // and a correlation ID, without logging arbitrary message/name/stack values.
    const requestId = crypto.randomUUID();
    const detail = error as { error?: unknown; statusCode?: unknown } | null;
    const code =
      typeof detail?.error === 'string' &&
      [
        'invalid_request',
        'invalid_client',
        'invalid_grant',
        'unauthorized_client',
        'unsupported_grant_type',
        'invalid_scope',
        'server_error',
        'temporarily_unavailable',
      ].includes(detail.error)
        ? detail.error
        : 'server_error';
    const status =
      typeof detail?.statusCode === 'number' &&
      Number.isInteger(detail.statusCode) &&
      detail.statusCode >= 400 &&
      detail.statusCode <= 599
        ? detail.statusCode
        : 500;
    console.error('[OIDC Route] Request failed', {
      code,
      method: req.method,
      path: requestUrl.pathname,
      requestId,
      status,
    });
    return new NextResponse('Internal Server Error', {
      headers: { 'X-Request-ID': requestId },
      status: 500,
    });
  }
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
