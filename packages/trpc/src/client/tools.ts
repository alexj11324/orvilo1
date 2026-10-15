import { createTRPCClient, httpBatchLink, type TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import superjson from 'superjson';

import { type ToolsRouter } from '@/server/routers/tools';

// Error handling link for tools client
const errorHandlingLink: TRPCLink<ToolsRouter> = () => {
  return ({ op, next }) =>
    observable((observer) =>
      next(op).subscribe({
        complete: () => observer.complete(),
        error: async (err) => {
          const status = err.data?.httpStatus as number;
          const code = err.data?.code as string;

          console.info('[toolsClient] Error:', {
            code,
            message: err.message,
            path: op.path,
            status,
          });

          observer.error(err);
        },
        next: (value) => observer.next(value),
      }),
    );
};

export const toolsClient = createTRPCClient<ToolsRouter>({
  links: [
    errorHandlingLink,
    httpBatchLink({
      headers: async () => {
        // dynamic import to avoid circular dependency
        const { createHeaderWithAuth } = await import('@/services/_auth');

        const headers = await createHeaderWithAuth();

        // Let business layer contribute extra headers (e.g. workspace context in Cloud).
        const { getBusinessTrpcHeaders } = await import('@/business/client/trpc-headers');
        Object.assign(headers as Record<string, string>, await getBusinessTrpcHeaders());

        return headers;
      },
      maxURLLength: 2083,
      transformer: superjson,
      url: '/trpc/tools',
    }),
  ],
});
