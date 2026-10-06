import {
  buildAcpBuiltinToolExtras,
  OrviloBuiltinMcpServer,
} from '@orvilo/heterogeneous-agents/builtinMcp';
import type { AcpBuiltinToolSpec } from '@orvilo/types';

import { createLambdaClient } from '../api/client';
import {
  persistChildResultInboxRecord,
  resolvePersistentToolCallId,
} from '../utils/childResultInbox';

/** One turn owns one callback server and one operation-scoped credential. */
export const openPrimeBuiltinMcp = async (input: {
  builtinTools?: AcpBuiltinToolSpec[];
  jwt: string;
  operationId: string;
  serverUrl: string;
  workspaceId?: string;
}) => {
  if (!input.builtinTools?.length) return undefined;
  const client = createLambdaClient(
    { serverUrl: input.serverUrl, token: input.jwt, tokenType: 'jwt' },
    input.workspaceId,
  );
  const server = new OrviloBuiltinMcpServer({
    extraTools: buildAcpBuiltinToolExtras(input.builtinTools, {
      ackChildResults: (args) => client.aiAgent.heteroAckChildResultDeliveries.mutate(args),
      awaitChildren: (args) => client.aiAgent.heteroAwaitBuiltinToolChildren.query(args),
      exec: (args) => client.aiAgent.heteroExecBuiltinTool.mutate(args),
      persistChildResultInbox: persistChildResultInboxRecord,
      resolveToolCallId: resolvePersistentToolCallId,
    }),
    includeAskUserTool: false,
  });
  try {
    await server.start();
    server.registerOperation(input.operationId);
    return {
      close: () => server.stop(),
      mount: { operationId: input.operationId, url: server.urlForOperation(input.operationId) },
    };
  } catch (error) {
    await server.stop();
    throw error;
  }
};
