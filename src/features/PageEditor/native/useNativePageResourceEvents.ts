'use client';

import { fetchEventSource } from '@orvilo/utils/client';
import { useEffect, useRef } from 'react';
import { z } from 'zod';

import { mutate } from '@/libs/swr';
import { documentLikeKeys, isDocumentCommentKeyForEvent } from '@/libs/swr/keys';

class FatalResourceStreamError extends Error {}

const resourceEventSchema = z.object({
  type: z.enum([
    'doc.updated',
    'lock.changed',
    'document.commentsChanged',
    'document.likesChanged',
  ]),
  data: z.object({ rootCommentId: z.string().optional() }).optional(),
});

export function parseNativePageResourceEvent(data: string) {
  try {
    const parsed: unknown = JSON.parse(data);
    const result = resourceEventSchema.safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

/** Auth and workspace headers match the existing lambda/SSE client. No SDK store. */
export function useNativePageResourceEvents({
  documentId,
  workspaceId,
  onDocumentUpdated,
  onLockChanged,
}: {
  documentId: string;
  workspaceId?: string | null;
  onDocumentUpdated: () => void;
  onLockChanged: () => void;
}) {
  const callbacks = useRef({ onDocumentUpdated, onLockChanged });
  callbacks.current = { onDocumentUpdated, onLockChanged };
  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    let connected = false;
    const start = async () => {
      const { createHeaderWithAuth } = await import('@/services/_auth');
      const { getBusinessTrpcHeaders } = await import('@/business/client/trpc-headers');
      const auth = new Headers(await createHeaderWithAuth());
      for (const [name, value] of Object.entries(await getBusinessTrpcHeaders()))
        auth.set(name, value);
      if (controller.signal.aborted) return;
      await fetchEventSource(
        `/webapi/document/events?documentId=${encodeURIComponent(documentId)}`,
        {
          credentials: 'include',
          headers: Object.fromEntries(auth.entries()),
          signal: controller.signal,
          onopen: async (response) => {
            if (controller.signal.aborted) return;
            if (
              !response.ok ||
              !response.headers.get('content-type')?.includes('text/event-stream')
            ) {
              if (response.status >= 400 && response.status < 500)
                throw new FatalResourceStreamError(`SSE failed: ${response.status}`);
              throw new Error(`SSE failed: ${response.status}`);
            }
            connected = true;
            // Reconcile both resources after reconnect; events can be lost in the gap.
            callbacks.current.onLockChanged();
            callbacks.current.onDocumentUpdated();
          },
          onmessage: ({ data }) => {
            if (controller.signal.aborted) return;
            const event = parseNativePageResourceEvent(data);
            if (!event) return;
            if (event.type === 'doc.updated') callbacks.current.onDocumentUpdated();
            else if (event.type === 'lock.changed') callbacks.current.onLockChanged();
            else if (event.type === 'document.likesChanged') {
              void mutate(documentLikeKeys.summary(workspaceId, documentId));
            } else {
              void mutate((key) =>
                isDocumentCommentKeyForEvent(key, {
                  documentId,
                  workspaceId,
                  rootCommentId: event.data?.rootCommentId,
                }),
              );
            }
          },
          onclose: () => {
            connected = false;
            throw new Error('Document event stream closed');
          },
          onerror: (error: unknown) => {
            connected = false;
            if (error instanceof FatalResourceStreamError) throw error;
            return 5000;
          },
        },
      );
    };
    // A transport/auth failure does not disable lock polling or periodic content refresh.
    void start().catch(() => {
      connected = false;
    });
    const fallback = setInterval(() => {
      if (connected || controller.signal.aborted) return;
      callbacks.current.onLockChanged();
      callbacks.current.onDocumentUpdated();
    }, 60_000);
    return () => {
      controller.abort();
      clearInterval(fallback);
    };
  }, [documentId, workspaceId]);
}
