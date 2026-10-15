import type { AcpBuiltinToolCaller } from '@orvilo/heterogeneous-agents/builtinMcp';
import type { HeteroRunClient } from '@orvilo/heterogeneous-agents/run';
import type { FileStorePort } from '@orvilo/heterogeneous-agents/spawn';
import superjson from 'superjson';

import { setDesktopUserAgentHeader } from '@/utils/user-agent';

import type { GatewayAcpTurnContext } from './gatewayAcpPool';

/**
 * Error thrown for a failed Lambda call. Mirrors the `TRPCClientError` fields
 * the shared run code inspects (`data.code`, e.g. `TrpcIngestSink.finish`
 * retries only INTERNAL_SERVER_ERROR / TIMEOUT / SERVICE_UNAVAILABLE).
 */
export class LambdaCallError extends Error {
  readonly data: { code?: string; httpStatus: number };

  constructor(message: string, data: { code?: string; httpStatus: number }) {
    super(message);
    this.name = 'LambdaCallError';
    this.data = data;
  }
}

export interface LambdaCallerOptions {
  fetchImpl?: typeof fetch;
  /** Token for this request. Read per request so a refresh in between is picked up. */
  getToken: () => Promise<string | null | undefined>;
  /** Called once on a 401; true means a retry with a fresh `getToken()` may succeed. */
  refreshToken?: () => Promise<boolean>;
  serverUrl: string;
  workspaceId?: string;
}

export interface LambdaCaller {
  mutate: <T = unknown>(procedure: string, input: unknown) => Promise<T>;
  query: <T = unknown>(procedure: string, input: unknown) => Promise<T>;
}

type TrpcEnvelope = { error?: unknown; result?: { data?: unknown } } | undefined;

const describeError = (
  payload: TrpcEnvelope,
  response: Response,
): { code?: string; message: string } => {
  if (!payload?.error) return { message: response.statusText };
  try {
    const error = superjson.deserialize(payload.error as any) as {
      code?: unknown;
      data?: { code?: string };
      message?: string;
    };
    return {
      code: error?.data?.code ?? (typeof error?.code === 'string' ? error.code : undefined),
      message: error?.message ?? response.statusText,
    };
  } catch {
    return { message: response.statusText };
  }
};

/**
 * Lambda tRPC over plain fetch with the wire format of the CLI's client
 * (`@trpc/client` v11 non-batched `httpLink` + superjson): queries are
 * `GET <url>/<proc>?input=<json>`, mutations `POST <url>/<proc>` with the
 * serialized input as body; both answer `{ result: { data } }` / `{ error }`.
 */
export const createLambdaCaller = (options: LambdaCallerOptions): LambdaCaller => {
  const base = `${options.serverUrl.replace(/\/$/, '')}/trpc/lambda`;
  const fetchImpl = options.fetchImpl ?? fetch;

  const send = async <T>(
    method: 'GET' | 'POST',
    procedure: string,
    input: unknown,
    allowRefresh: boolean,
  ): Promise<T> => {
    const token = await options.getToken();
    if (!token)
      throw new LambdaCallError(`trpc ${procedure} failed: no access token`, {
        code: 'UNAUTHORIZED',
        httpStatus: 401,
      });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Oidc-Auth': token,
    };
    if (options.workspaceId) headers['X-Workspace-Id'] = options.workspaceId;
    setDesktopUserAgentHeader(headers);

    const serialized = JSON.stringify(superjson.serialize(input));
    const url =
      method === 'GET'
        ? `${base}/${procedure}?input=${encodeURIComponent(serialized)}`
        : `${base}/${procedure}`;
    const response = await fetchImpl(url, {
      ...(method === 'POST' ? { body: serialized } : {}),
      headers,
      method,
    });

    if (response.status === 401 && allowRefresh && options.refreshToken) {
      const refreshed = await options.refreshToken().catch(() => false);
      if (refreshed) return send<T>(method, procedure, input, false);
    }

    const payload = (await response.json().catch(() => undefined)) as TrpcEnvelope;
    if (!response.ok || !payload || 'error' in payload) {
      const { code, message } = describeError(payload, response);
      throw new LambdaCallError(`trpc ${procedure} failed: ${response.status} ${message}`, {
        code,
        httpStatus: response.status,
      });
    }
    return superjson.deserialize(payload.result?.data as any) as T;
  };

  return {
    mutate: (procedure, input) => send('POST', procedure, input, true),
    query: (procedure, input) => send('GET', procedure, input, true),
  };
};

export interface DesktopRemoteAuth {
  getAccessToken: () => Promise<string | null>;
  /** Refresh the device token; resolves true on success. */
  refreshAccessToken?: () => Promise<boolean>;
}

/**
 * `HeteroRunClient` for in-process gateway runs, authenticated like the CLI
 * wrapper the desktop used to spawn: this device's own access token (read per
 * request, refreshed once on 401), falling back to the dispatched token.
 */
export const createDesktopHeteroRunClient = (params: {
  auth: DesktopRemoteAuth;
  fallbackJwt?: string;
  fetchImpl?: typeof fetch;
  serverUrl: string;
  workspaceId?: string;
}): HeteroRunClient & { fileStore: FileStorePort; lambda: LambdaCaller } => {
  const lambda = createLambdaCaller({
    fetchImpl: params.fetchImpl,
    getToken: async () => (await params.auth.getAccessToken()) || params.fallbackJwt,
    refreshToken: params.auth.refreshAccessToken,
    serverUrl: params.serverUrl,
    workspaceId: params.workspaceId,
  });

  return {
    aiAgent: {
      heteroFinish: { mutate: (input) => lambda.mutate('aiAgent.heteroFinish', input) },
      heteroIngest: { mutate: (input) => lambda.mutate('aiAgent.heteroIngest', input) },
      waitInterventionResponse: {
        query: (input) => lambda.query('aiAgent.waitInterventionResponse', input),
      },
    },
    fileStore: {
      abortS3Upload: (input) => lambda.mutate('upload.abortS3Upload', input),
      checkFileHash: (input) => lambda.mutate('file.checkFileHash', input),
      createFile: (input) => lambda.mutate('file.createFile', input),
      createS3PreSignedUrl: (input) => lambda.mutate('upload.createS3PreSignedUrl', input),
    },
    lambda,
  };
};

/**
 * Builtin-tool caller for a pooled `orvilo_cc` server. The server outlives one
 * operation, so every call reads the CURRENT turn from `getTurn()` and
 * authenticates with its operation-scoped token (`hetero:tool:exec`), exactly
 * like `hetero exec`'s `ORVILO_OPERATION_JWT` client.
 *
 * v1 omits the CLI's durable `persistChildResultInbox` / `resolveToolCallId`
 * (they live in `apps/cli` and write `~/.orvilo/inbox`); the handler then uses
 * its deterministic request-key fallback and a crash between settle and ack is
 * recovered by the server replaying the offered deliveries.
 */
export const createDesktopBuiltinToolCaller = (
  getTurn: () => GatewayAcpTurnContext | undefined,
  fetchImpl?: typeof fetch,
): AcpBuiltinToolCaller => {
  const callerFor = () => {
    const turn = getTurn();
    if (!turn) throw new Error('No active gateway turn for builtin tool call');
    return createLambdaCaller({
      fetchImpl,
      getToken: async () => turn.operationJwt,
      serverUrl: turn.serverUrl,
      workspaceId: turn.workspaceId,
    });
  };

  return {
    ackChildResults: (input) => callerFor().mutate('aiAgent.heteroAckChildResultDeliveries', input),
    awaitChildren: (input) => callerFor().query('aiAgent.heteroAwaitBuiltinToolChildren', input),
    exec: (input) => callerFor().mutate('aiAgent.heteroExecBuiltinTool', input),
    requestApproval: async ({ apiName, args, expiresAt, identifier, toolCallId, windowId }) => {
      const bridge = getTurn()?.bridge;
      if (!bridge) return { cancelReason: 'session_ended', cancelled: true };
      const argsPreview = JSON.stringify(args);
      return bridge.pending(
        {
          arguments: {
            questions: [
              {
                header: `${identifier}.${apiName}`,
                multiSelect: false,
                options: [
                  { id: 'approve', label: 'Approve' },
                  { id: 'deny', label: 'Deny' },
                ],
                question:
                  `Allow tool "${identifier}.${apiName}" to run?\n\n` +
                  (argsPreview.length > 2000 ? `${argsPreview.slice(0, 2000)}…` : argsPreview),
              },
            ],
          },
          interactionKind: 'permission',
          toolCallId,
          windowId,
        },
        {
          timeoutMs: expiresAt === undefined ? undefined : Math.max(1, expiresAt - Date.now()),
        },
      );
    },
  };
};
