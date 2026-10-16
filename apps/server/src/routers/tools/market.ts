import { MARKET_AUTH_REQUIRED_MESSAGE } from '@orvilo/desktop-bridge';
import { TRPCError } from '@trpc/server';
import debug from 'debug';
import { z } from 'zod';

import {
  requireWorkspaceRoleWhenScoped,
  wsCompatProcedure,
} from '@/business/server/trpc-middlewares/workspaceAuth';
import { UserModel } from '@/database/models/user';
import { router } from '@/libs/trpc/lambda';
import { marketUserInfo, serverDatabase, telemetry } from '@/libs/trpc/lambda/middleware';
import { FileService } from '@/server/services/file';
import { MarketService } from '@/server/services/market';
import { createSandboxService } from '@/server/services/sandbox';
import { preprocessLhCommand } from '@/server/services/toolExecution/preprocessLhCommand';

const log = debug('orvilo-server:tools:market');

const isSandboxAuthError = (error?: { message?: string; name?: string }) => {
  const code = error?.name;
  const message = error?.message || '';

  return (
    code === 'invalid_token' ||
    code === 'token_expired' ||
    code === 'unauthorized' ||
    message.toLowerCase().includes('invalid_token') ||
    message.toLowerCase().includes('token expired') ||
    message.toLowerCase().includes('unauthorized')
  );
};

const throwSandboxAuthError = () => {
  throw new TRPCError({
    code: 'UNAUTHORIZED',
    message: MARKET_AUTH_REQUIRED_MESSAGE,
  });
};

// ============================== Common Procedure ==============================
const marketToolProcedure = wsCompatProcedure
  .use(serverDatabase)
  .use(telemetry)
  .use(marketUserInfo)
  .use(async ({ ctx, next }) => {
    const userModel = new UserModel(ctx.serverDB, ctx.userId);

    // In a workspace context, sandbox runtime calls are attributed to the
    // workspace's Market organization via the workspaceId carried in the trust
    // token (`ctx.marketUserInfo.workspaceId`, set by the marketUserInfo
    // middleware). Falls back to the personal account when there's no workspace.
    return next({
      ctx: {
        fileService: new FileService(ctx.serverDB, ctx.userId, ctx.workspaceId ?? undefined),
        marketService: new MarketService({
          accessToken: ctx.marketAccessToken,
          userInfo: ctx.marketUserInfo,
        }),
        userModel,
        workspaceId: ctx.workspaceId,
      },
    });
  });

// Execution mutations (sandbox runs, cloud MCP calls, file exports) have side
// effects and spend quota — workspace viewers (read-only) are gated out while
// personal mode passes through unrestricted.
const marketToolWriteProcedure = marketToolProcedure.use(requireWorkspaceRoleWhenScoped('member'));

const execInSandboxSchema = z.object({
  params: z.record(z.string(), z.any()),
  toolName: z.string(),
  topicId: z.string(),
  /**
   * SECURITY: accepted for backward compatibility with older clients (the SPA
   * and desktop still send it, see `src/services/cloudSandbox.ts`) but
   * ALWAYS IGNORED by the handler — the effective identity is `ctx.userId`.
   *
   * It used to override `ctx.userId`, which let any authenticated caller mint
   * and read another user's JWT: `preprocessLhCommand` signs a user JWT and
   * inlines it into the shell command run inside a sandbox the caller fully
   * controls (`declare -f orvilo` prints the injected token back). The same forged
   * id also selected the AgentSkill/File rows and the sandbox session.
   *
   * @deprecated Ignored by the server; will be dropped once no client sends it.
   */
  userId: z.string().optional(),
});

// Schema for export and upload file (combined operation)
const exportAndUploadFileSchema = z.object({
  filename: z.string(),
  path: z.string(),
  topicId: z.string(),
});

export type ExecInSandboxInput = z.infer<typeof execInSandboxSchema>;
export type ExportAndUploadFileInput = z.infer<typeof exportAndUploadFileSchema>;

// Schema for cloud MCP endpoint call
export interface CallToolResult {
  error?: {
    message: string;
    name?: string;
  };
  result: any;
  sessionExpiredAndRecreated?: boolean;
  success: boolean;
}

export interface ExportAndUploadFileResult {
  error?: {
    message: string;
  };
  fileId?: string;
  filename: string;
  mimeType?: string;
  size?: number;
  success: boolean;
  url?: string;
}

// ============================== Sandbox Handler ==============================
const execInSandboxHandler = async ({
  input,
  ctx,
}: {
  ctx: {
    fileService: FileService;
    marketService: MarketService;
    serverDB: any;
    userId: string;
    workspaceId?: string | null;
  };
  input: ExecInSandboxInput;
}): Promise<CallToolResult> => {
  const { toolName, params, topicId } = input;
  // SECURITY: never trust `input.userId` — see the JSDoc on `execInSandboxSchema`.
  // Everything downstream (JWT minting, skill/file lookups, sandbox session
  // isolation) is keyed off this id, so it must come from the authenticated
  // context only.
  const userId = ctx.userId;

  if (input?.userId && input.userId !== ctx.userId) {
    log(
      'execInSandbox: ignored deprecated input.userId=%s (differs from ctx.userId=%s)',
      input.userId,
      ctx.userId,
    );
  }

  log('execInSandbox: tool=%s, topicId=%s', toolName, topicId);

  try {
    let enhancedParams = params;

    // Preprocess orvilo commands: rewrite to npx @orvilo/cli + inject auth env vars
    //
    // The minted credential is always scoped to `ctx.userId`, i.e. the caller
    // themselves. This route is an `authedProcedure` invoked directly by a
    // client, so it carries no `agentShareVisitor` context; a visitor reaching
    // it can therefore only ever act as (and spend as) their own account, which
    // is why no `shareVisitorBlocked` guard is applied here.
    if ((toolName === 'execScript' || toolName === 'runCommand') && params.command) {
      const lhResult = await preprocessLhCommand(
        params.command,
        userId,
        ctx.workspaceId ?? undefined,
      );

      if (lhResult.error) {
        return {
          error: { message: lhResult.error, name: 'AuthError' },
          result: null,
          sessionExpiredAndRecreated: false,
          success: false,
        };
      }

      if (lhResult.skipSkillLookup) {
        enhancedParams = { ...params, command: lhResult.command };
      }
    }

    const sandboxService = createSandboxService({
      fileService: ctx.fileService,
      marketService: ctx.marketService,
      serverDB: ctx.serverDB,
      topicId,
      userId,
    });

    const response = await sandboxService.callTool(toolName, enhancedParams);

    log('execInSandbox response for %s: %O', toolName, response);

    if (!response.success && isSandboxAuthError(response.error)) {
      throwSandboxAuthError();
    }

    return response;
  } catch (error) {
    log('execInSandbox error for %s: %O', toolName, error);

    // Re-throw TRPCError as-is (e.g., UNAUTHORIZED from above)
    if (error instanceof TRPCError) {
      throw error;
    }

    const errorMessage = (error as Error).message;

    // Check for authentication errors thrown as exceptions
    if (
      errorMessage.toLowerCase().includes('invalid_token') ||
      errorMessage.toLowerCase().includes('token expired') ||
      errorMessage.toLowerCase().includes('unauthorized')
    ) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: MARKET_AUTH_REQUIRED_MESSAGE,
      });
    }

    return {
      error: {
        message: errorMessage,
        name: (error as Error).name,
      },
      result: null,
      sessionExpiredAndRecreated: false,
      success: false,
    };
  }
};

// ============================== Router ==============================
export const marketRouter = router({
  /** @deprecated Use execInSandbox instead. Will be removed in a future version. */
  callCodeInterpreterTool: marketToolWriteProcedure
    .input(execInSandboxSchema)
    .mutation(({ input, ctx }) => execInSandboxHandler({ ctx, input })),

  // ============================== Sandbox Execution ==============================
  execInSandbox: marketToolWriteProcedure
    .input(execInSandboxSchema)
    .mutation(({ input, ctx }) => execInSandboxHandler({ ctx, input })),

  /**
   * Export a file from sandbox and upload to S3, then create a persistent file record
   * This combines the previous getExportFileUploadUrl + execInSandbox + createFileRecord flow
   * Returns a permanent /f/:id URL instead of a temporary pre-signed URL
   */
  exportAndUploadFile: marketToolWriteProcedure
    .input(exportAndUploadFileSchema)
    .mutation(async ({ input, ctx }) => {
      const { path, filename, topicId } = input;

      log('Exporting and uploading file: %s from path: %s in topic: %s', filename, path, topicId);

      try {
        const sandboxService = createSandboxService({
          fileService: ctx.fileService,
          marketService: ctx.marketService,
          topicId,
          userId: ctx.userId,
        });
        const result = await sandboxService.exportAndUploadFile(path, filename);

        if (!result.success && isSandboxAuthError(result.error)) {
          throwSandboxAuthError();
        }

        return result as ExportAndUploadFileResult;
      } catch (error) {
        log('Error in exportAndUploadFile: %O', error);

        // Re-throw TRPCError as-is
        if (error instanceof TRPCError) {
          throw error;
        }

        const errorMessage = (error as Error).message;

        // Check for authentication errors
        if (
          errorMessage.toLowerCase().includes('invalid_token') ||
          errorMessage.toLowerCase().includes('token expired') ||
          errorMessage.toLowerCase().includes('unauthorized')
        ) {
          throwSandboxAuthError();
        }

        return {
          error: { message: errorMessage },
          filename,
          success: false,
        } as ExportAndUploadFileResult;
      }
    }),
});
