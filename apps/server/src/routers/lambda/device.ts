import {
  type HeterogeneousAgentScanMap,
  REMOTE_HETEROGENEOUS_AGENT_CONFIGS,
} from '@orvilo/heterogeneous-agents';
import type { DeviceListItem } from '@orvilo/types';
import {
  deriveWorktreePath,
  resolveAgentAgencyConfig,
  sortDevicesByActivity,
  workingDirConfigSchema,
} from '@orvilo/types';
import { deserializeMcpIpcPayload } from '@orvilo/utils/mcpIpcPayload';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  requireWorkspaceRole,
  wsCompatProcedure,
} from '@/business/server/trpc-middlewares/workspaceAuth';
import { AgentModel } from '@/database/models/agent';
import { DeviceModel } from '@/database/models/device';
import { UserModel } from '@/database/models/user';
import { WorkspaceUserSettingsModel } from '@/database/models/workspaceUserSettings';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { deviceGateway } from '@/server/services/deviceGateway';
import { listAuthorizedDeviceCandidates } from '@/server/services/deviceGateway/executionAdmission';
import { scanDeviceAgents } from '@/server/services/deviceGateway/installedRuntimeEvidence';
import {
  canManageResourcePermission,
  getResourceMeta,
  isWorkspaceScopedMeta,
} from '@/server/services/resourcePermission';

import { assertCanUseWorkspaceAgent } from './_helpers/workspaceAgentGuard';
import { preserveWorkspaceCache } from './deviceWorkingDirs';
import {
  assertExecutionDeviceAccessible,
  assertWorkspaceGitRootApproved,
  assertWorkspaceRootApproved,
} from './deviceWorkspaceGuard';

// Derive the zod enum from the canonical config so new platforms are
// automatically covered without touching this file.
const remotePlatformEnum = z.enum(
  REMOTE_HETEROGENEOUS_AGENT_CONFIGS.map((c) => c.type) as [
    (typeof REMOTE_HETEROGENEOUS_AGENT_CONFIGS)[number]['type'],
    ...(typeof REMOTE_HETEROGENEOUS_AGENT_CONFIGS)[number]['type'][],
  ],
);

const CAPABILITY_TIMEOUT_MS = 5_000;
const PROFILE_TIMEOUT_MS = 5_000;

// Device ownership is independent of workspace context. A workspace member may
// address another member's device only through an Agent they can use.
const deviceProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  const wsId = ctx.workspaceId ?? undefined;
  const deviceModel = new DeviceModel(ctx.serverDB, ctx.userId, wsId);

  const raw = (await opts.getRawInput()) as { deviceId?: unknown } | undefined;
  if (typeof raw?.deviceId === 'string') {
    if (wsId) {
      await assertExecutionDeviceAccessible(deviceModel, raw.deviceId);
      if (!(await deviceModel.findByDeviceId(raw.deviceId))) {
        const boundAgents = await deviceModel.getBoundAgentIds(raw.deviceId);
        let authorized = false;
        for (const agentId of boundAgents) {
          try {
            await assertCanUseWorkspaceAgent({
              db: ctx.serverDB,
              userId: ctx.userId,
              workspaceId: wsId,
              agentId,
            });
            authorized = true;
            break;
          } catch (error) {
            if (!(error instanceof TRPCError) || error.code !== 'FORBIDDEN') throw error;
          }
        }
        if (!authorized)
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You cannot use the Agent bound to this device.',
          });
      }
    } else if (!(await deviceModel.findByDeviceId(raw.deviceId))) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Personal device not found.' });
    }
  }

  return opts.next({
    ctx: {
      agentModel: new AgentModel(ctx.serverDB, ctx.userId, wsId),
      workspaceUserSettingsModel: wsId
        ? new WorkspaceUserSettingsModel(ctx.serverDB, ctx.userId, wsId)
        : undefined,
      deviceModel,
      userId: ctx.userId,
      workspaceId: wsId,
    },
  });
});

const deviceWritableProcedure = deviceProcedure.use(async (opts) => {
  const raw = (await opts.getRawInput()) as { deviceId?: string } | undefined;
  const owned = raw?.deviceId && (await opts.ctx.deviceModel.findByDeviceId(raw.deviceId));
  const role = (opts.ctx as { workspaceRole?: string }).workspaceRole;
  if (opts.ctx.workspaceId && !owned && !['owner', 'admin', 'member'].includes(role ?? '')) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'A writable workspace role is required to change the Agent’s execution files.',
    });
  }
  return opts.next();
});

// Content and Git RPCs use three existing input names for the approved directory.
const approvedDirectoryProcedure = (field: 'path' | 'root' | 'scope') =>
  deviceProcedure.use(async (opts) => {
    const input = z
      .object({ deviceId: z.string(), [field]: z.string() })
      .parse(await opts.getRawInput());
    await assertWorkspaceRootApproved(
      opts.ctx.deviceModel,
      input.deviceId,
      input[field],
      opts.ctx.workspaceId,
    );
    return opts.next();
  });
const devicePathProcedure = approvedDirectoryProcedure('path').input(
  z.object({ deviceId: z.string(), path: z.string() }),
);
const deviceScopeProcedure = approvedDirectoryProcedure('scope');
const deviceRootProcedure = approvedDirectoryProcedure('root');
const deviceGitProcedure = devicePathProcedure.use(async (opts) => {
  await assertWorkspaceGitRootApproved(opts.ctx.deviceModel, {
    ...opts.input,
    userId: opts.ctx.userId,
    workspaceId: opts.ctx.workspaceId,
  });
  return opts.next();
});
const devicePathWritableProcedure = devicePathProcedure
  .use(requireWorkspaceRole('member'))
  .use(async (opts) => {
    await assertWorkspaceGitRootApproved(opts.ctx.deviceModel, {
      ...opts.input,
      userId: opts.ctx.userId,
      workspaceId: opts.ctx.workspaceId,
    });
    return opts.next();
  });

// Personal metadata is owned by the authenticated user, independently of the
// active workspace selector carried by the Settings UI or CLI client.
const personalDeviceProcedure = authedProcedure.use(serverDatabase).use(async (opts) =>
  opts.next({
    ctx: { deviceModel: new DeviceModel(opts.ctx.serverDB, opts.ctx.userId) },
  }),
);

const workspaceFileInput = z.object({
  deviceId: z.string(),
  workingDirectory: z.string(),
});

/**
 * MCP params for a tunneled call — mirrors `GatewayMcpParams` in
 * `@orvilo/device-gateway-client` (stdio spawn params vs http endpoint +
 * credentials), discriminated on `type`.
 */
const gatewayMcpParamsSchema = z.discriminatedUnion('type', [
  z.object({
    args: z.array(z.string()),
    command: z.string(),
    env: z.record(z.string(), z.string()).optional(),
    name: z.string(),
    type: z.literal('stdio'),
  }),
  z.object({
    auth: z
      .object({
        accessToken: z.string().optional(),
        token: z.string().optional(),
        type: z.enum(['none', 'bearer', 'oauth2']),
      })
      .optional(),
    headers: z.record(z.string(), z.string()).optional(),
    name: z.string(),
    type: z.literal('http'),
    url: z.string(),
  }),
]);

const deviceMcpFailure = (error: string | undefined): never => {
  // An old device client has no MCP RPC surface — surface the same
  // OPERATION_UNSUPPORTED contract the client's honest-degradation path
  // throws, so the UI can offer the right affordance (upgrade, not retry).
  if (error?.includes('does not support')) {
    throw new TRPCError({
      cause: { data: { code: 'OPERATION_UNSUPPORTED' } },
      code: 'PRECONDITION_FAILED',
      message: error,
    });
  }
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: error || 'Device MCP query failed',
  });
};

/**
 * `deviceProcedure` + the same device-addressability rule the repair gate
 * uses: the named device must be in the caller's authorized registry —
 * their personal row or a workspace row they can see. Without it a caller
 * could aim MCP probe/call traffic at a deviceId they should not address.
 */
const deviceMcpProcedure = deviceWritableProcedure.use(async (opts) => {
  const { ctx } = opts;
  const raw = (await opts.getRawInput()) as { deviceId?: unknown } | undefined;
  if (typeof raw?.deviceId !== 'string' || !raw.deviceId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'deviceId is required' });
  }
  const row =
    (await ctx.deviceModel.findByDeviceId(raw.deviceId)) ??
    (ctx.workspaceId ? await ctx.deviceModel.findExecutionDeviceById(raw.deviceId) : undefined);
  if (!row) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'The requested device is not in your authorized device registry.',
    });
  }
  return opts.next();
});

/**
 * `deviceProcedure` that additionally requires `workingDirectory` to be an
 * approved workspace root for the device. Builds the guard into the procedure
 * so every file-mutating route inherits it and can never forget the check —
 * see {@link assertWorkspaceRootApproved} for why the check is necessary.
 */
const workspaceFileProcedure = deviceProcedure.input(workspaceFileInput).use(async (opts) => {
  const { deviceId, workingDirectory } = workspaceFileInput.parse(await opts.getRawInput());
  await assertWorkspaceRootApproved(
    opts.ctx.deviceModel,
    deviceId,
    workingDirectory,
    opts.ctx.workspaceId,
  );
  return opts.next();
});

const workspaceFileWritableProcedure = workspaceFileProcedure.use(requireWorkspaceRole('member'));

export const deviceRouter = router({
  /**
   * Probe whether a specific agent platform (openclaw / hermes) is available
   * on the given device. Dispatches a `checkPlatformCapability` tool call to
   * the device via the gateway and waits up to 5 s for a response.
   */
  checkCapability: deviceWritableProcedure
    .input(
      z.object({
        deviceId: z.string(),
        platform: remotePlatformEnum,
        scope: z.enum(['personal', 'workspace']).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const result = await deviceGateway.executeToolCall(
        {
          deviceId: input.deviceId,
          userId: ctx.userId,
          workspaceId: input.scope === 'personal' ? undefined : ctx.workspaceId,
        },
        {
          apiName: 'checkPlatformCapability',
          arguments: JSON.stringify({ platform: input.platform }),
          identifier: 'local',
        },
        CAPABILITY_TIMEOUT_MS,
      );

      if (!result.success) {
        return { available: false, reason: result.error ?? 'Device tool call failed' };
      }

      try {
        return JSON.parse(result.content) as {
          available: boolean;
          reason?: string;
          version?: string;
        };
      } catch {
        return { available: false, reason: 'Invalid response from device' };
      }
    }),

  /**
   * Scan the given device for every known heterogeneous agent type in one
   * pass. Dispatches a `scanHeterogeneousAgents` tool call to the device via
   * the gateway; the device probes each binary and returns an availability
   * map. On gateway failure (offline device, older client without the tool)
   * returns an empty map plus the error so the client can distinguish
   * "nothing installed" from "scan failed".
   */
  scanAgents: deviceWritableProcedure
    .input(z.object({ deviceId: z.string() }))
    .query(
      async ({ ctx, input }): Promise<{ agents: HeterogeneousAgentScanMap; error?: string }> => {
        const { agents, error } = await scanDeviceAgents(ctx.serverDB, {
          deviceId: input.deviceId,
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
        });
        return { agents, ...(error ? { error } : {}) };
      },
    ),

  /**
   * Granular git reads for a directory on a remote device, each via its own
   * device RPC so the web/remote git status bar mirrors the local desktop's
   * separate, differently-cadenced SWR hooks. Return `null` when offline / the
   * directory isn't a git repo.
   */
  gitBranch: deviceGitProcedure
    .input(z.object({ deviceId: z.string(), path: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await deviceGateway.gitBranch({
        deviceId: input.deviceId,
        path: input.path,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
      return result ?? null;
    }),

  gitLinkedPullRequest: deviceGitProcedure
    .input(
      z.object({
        branch: z.string(),
        deviceId: z.string(),
        path: z.string(),
        pullRequestNumber: z.number().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const result = await deviceGateway.gitLinkedPullRequest({
        branch: input.branch,
        deviceId: input.deviceId,
        path: input.path,
        pullRequestNumber: input.pullRequestNumber,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
      return result ?? null;
    }),

  gitWorkingTreeStatus: deviceGitProcedure
    .input(z.object({ deviceId: z.string(), path: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await deviceGateway.gitWorkingTreeStatus({
        deviceId: input.deviceId,
        path: input.path,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
      return result ?? null;
    }),

  gitAheadBehind: deviceGitProcedure
    .input(z.object({ deviceId: z.string(), path: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await deviceGateway.gitAheadBehind({
        deviceId: input.deviceId,
        path: input.path,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
      return result ?? null;
    }),

  /**
   * Claude Code subscription quota sampled by the device with its own local
   * credentials, so web clients can show live quota for a bound-device run.
   * `null` when the device is offline or its client predates this RPC.
   */
  getClaudeCodeQuota: deviceProcedure
    .input(
      z.object({
        deviceId: z.string(),
        env: z.record(z.string(), z.string()).optional(),
        force: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const result = await deviceGateway.claudeCodeQuota({
        deviceId: input.deviceId,
        env: input.env,
        force: input.force,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
      return result ?? null;
    }),

  listHeterogeneousAgentPermissions: deviceWritableProcedure
    .input(
      z.object({
        args: z.array(z.string()).optional(),
        command: z.string().optional(),
        cwd: z.string().optional(),
        deviceId: z.string(),
        env: z.record(z.string(), z.string()).optional(),
        type: z.string(),
      }),
    )
    .query(async ({ ctx, input }) =>
      deviceGateway.listHeterogeneousAgentPermissions({
        ...input,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      }),
    ),

  /** Query a heterogeneous CLI's model catalog on the device that will execute the agent. */
  listHeterogeneousAgentModels: deviceWritableProcedure
    .input(
      z.object({
        args: z.array(z.string()).optional(),
        command: z.string().optional(),
        cwd: z.string().optional(),
        deviceId: z.string(),
        env: z.record(z.string(), z.string()).optional(),
        type: z.enum([
          'claude-code',
          'codex',
          'codebuddy',
          'cursor',
          'droid',
          'devin',
          'grok-build',
          'opencode',
          'pi',
          'qoder',
          'trae',
        ]),
      }),
    )
    .query(async ({ ctx, input }) =>
      deviceGateway.listHeterogeneousAgentModels({
        args: input.args,
        command: input.command,
        cwd: input.cwd,
        deviceId: input.deviceId,
        env: input.env,
        type: input.type,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      }),
    ),

  /**
   * List the git worktrees attached to the same repository as a directory on a
   * remote device, via the device's `listGitWorktrees` RPC. Lets the web/remote
   * worktree picker mirror the local desktop's, populated over IPC.
   */
  listGitWorktrees: deviceGitProcedure
    .input(z.object({ deviceId: z.string(), path: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await deviceGateway.listGitWorktrees({
        deviceId: input.deviceId,
        path: input.path,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
      return result ?? [];
    }),

  /**
   * List the local branches of a directory on a remote device, via the device's
   * `listGitBranches` RPC. Lets the web/remote branch switcher populate the same
   * dropdown the local desktop renders over IPC.
   */
  listGitBranches: deviceGitProcedure
    .input(
      z.object({
        deviceId: z.string(),
        path: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const result = await deviceGateway.listGitBranches({
        deviceId: input.deviceId,
        path: input.path,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
      return result ?? [];
    }),

  /**
   * Checkout (or create) a branch in a directory on a remote device, via the
   * device's `checkoutGitBranch` RPC.
   */
  checkoutGitBranch: devicePathWritableProcedure
    .input(
      z.object({
        branch: z.string(),
        create: z.boolean().optional(),
        deviceId: z.string(),
        path: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      deviceGateway.checkoutGitBranch({
        branch: input.branch,
        create: input.create,
        deviceId: input.deviceId,
        path: input.path,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      }),
    ),

  /**
   * Rename a branch in a directory on a remote device, via the device's
   * `renameGitBranch` RPC.
   */
  renameGitBranch: devicePathWritableProcedure
    .input(
      z.object({
        deviceId: z.string(),
        from: z.string(),
        path: z.string(),
        to: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      deviceGateway.renameGitBranch({
        deviceId: input.deviceId,
        from: input.from,
        path: input.path,
        to: input.to,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      }),
    ),

  /**
   * Delete a branch in a directory on a remote device, via the device's
   * `deleteGitBranch` RPC.
   */
  deleteGitBranch: devicePathWritableProcedure
    .input(
      z.object({
        branch: z.string(),
        deviceId: z.string(),
        path: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      deviceGateway.deleteGitBranch({
        branch: input.branch,
        deviceId: input.deviceId,
        path: input.path,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      }),
    ),

  /**
   * Remove a worktree in a directory's repository on a remote device,
   * via the device's `removeGitWorktree` RPC.
   */
  removeGitWorktree: devicePathWritableProcedure
    .input(
      z.object({
        deviceId: z.string(),
        path: z.string(),
        worktreePath: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertWorkspaceRootApproved(
        ctx.deviceModel,
        input.deviceId,
        input.worktreePath,
        ctx.workspaceId,
      );
      return deviceGateway.removeGitWorktree({
        deviceId: input.deviceId,
        path: input.path,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        worktreePath: input.worktreePath,
      });
    }),

  /**
   * Add a linked worktree on a fresh branch in a directory's repository on a
   * remote device, via the device's `addGitWorktree` RPC.
   *
   * The target directory is derived here from the trusted `path` + `branch`
   * (a `<repo>-<branch>` sibling) rather than accepted from the request, so a
   * crafted web call can't ask the device to check out at an arbitrary absolute
   * path — the branch is folded to `-` in the folder name, so it can't traverse.
   */
  addGitWorktree: devicePathWritableProcedure
    .input(
      z.object({
        branch: z.string(),
        deviceId: z.string(),
        path: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const worktreePath = deriveWorktreePath(input.path, input.branch);
      await assertWorkspaceRootApproved(
        ctx.deviceModel,
        input.deviceId,
        worktreePath,
        ctx.workspaceId,
      );
      return deviceGateway.addGitWorktree({
        branch: input.branch,
        deviceId: input.deviceId,
        path: input.path,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        worktreePath,
      });
    }),

  /**
   * Pull (`--ff-only`) the current branch of a directory on a remote device, via
   * the device's `pullGitBranch` RPC.
   */
  pullGitBranch: devicePathWritableProcedure
    .input(z.object({ deviceId: z.string(), path: z.string() }))
    .mutation(async ({ ctx, input }) =>
      deviceGateway.pullGitBranch({
        deviceId: input.deviceId,
        path: input.path,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      }),
    ),

  /**
   * Push the current branch of a directory on a remote device, via the device's
   * `pushGitBranch` RPC.
   */
  pushGitBranch: devicePathWritableProcedure
    .input(z.object({ deviceId: z.string(), path: z.string() }))
    .mutation(async ({ ctx, input }) =>
      deviceGateway.pushGitBranch({
        deviceId: input.deviceId,
        path: input.path,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      }),
    ),

  /**
   * Working-tree (unstaged) per-file patches for a directory on a remote device,
   * via the device's `getGitWorkingTreePatches` RPC. Powers the web/remote Review
   * panel's unstaged diff. Returns `null` when offline / not a git repo.
   */
  getGitWorkingTreePatches: deviceGitProcedure
    .input(z.object({ deviceId: z.string(), path: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await deviceGateway.getGitWorkingTreePatches({
        deviceId: input.deviceId,
        path: input.path,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
      return result ?? null;
    }),

  /**
   * Branch diff (current branch vs base ref) per-file patches for a directory on
   * a remote device, via the device's `getGitBranchDiff` RPC.
   */
  getGitBranchDiff: deviceGitProcedure
    .input(z.object({ baseRef: z.string().optional(), deviceId: z.string(), path: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await deviceGateway.getGitBranchDiff({
        baseRef: input.baseRef,
        deviceId: input.deviceId,
        path: input.path,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
      return result ?? null;
    }),

  /**
   * List the remote branches of a directory on a remote device, via the device's
   * `listGitRemoteBranches` RPC. Populates the Review base-ref picker.
   */
  listGitRemoteBranches: deviceGitProcedure
    .input(z.object({ deviceId: z.string(), path: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await deviceGateway.listGitRemoteBranches({
        deviceId: input.deviceId,
        path: input.path,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
      return result ?? [];
    }),

  /**
   * Repo-relative paths of dirty working-tree files for a directory on a remote
   * device, via the device's `getGitWorkingTreeFiles` RPC. Powers the Files tab's
   * git-status overlay. Returns `null` when offline / not a git repo.
   */
  getGitWorkingTreeFiles: deviceGitProcedure
    .input(z.object({ deviceId: z.string(), path: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await deviceGateway.getGitWorkingTreeFiles({
        deviceId: input.deviceId,
        path: input.path,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
      return result ?? null;
    }),

  /**
   * Project file index (tree) for a directory on a remote device, via the
   * device's `getProjectFileIndex` RPC. Powers the Files tab's tree. Returns
   * `null` when offline.
   */
  getProjectFileIndex: deviceScopeProcedure
    .input(z.object({ deviceId: z.string(), scope: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await deviceGateway.getProjectFileIndex({
        deviceId: input.deviceId,
        scope: input.scope,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
      if (result)
        await assertWorkspaceRootApproved(
          ctx.deviceModel,
          input.deviceId,
          result.root,
          ctx.workspaceId,
        );
      return result ?? null;
    }),

  /**
   * Children of one directory inside a project on a remote device. The Files
   * tree calls this when the user expands a directory the index collapsed
   * (a fully git-ignored folder). Returns `null` when offline.
   */
  listProjectDirectory: deviceRootProcedure
    .input(z.object({ deviceId: z.string(), relativePath: z.string(), root: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await deviceGateway.listProjectDirectory({
        deviceId: input.deviceId,
        relativePath: input.relativePath,
        root: input.root,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
      return result ?? null;
    }),

  /**
   * Browse one directory level on a remote device. Personal devices belong to
   * the caller. A workspace device may expose new paths only to its enroller or
   * a workspace owner; other members continue to use its approved recents.
   */
  browseDirectory: deviceProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        deviceId: z.string(),
        limit: z.number().int().positive().max(1000).optional(),
        path: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!(await ctx.deviceModel.findByDeviceId(input.deviceId))) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only the device owner can browse new directories.',
        });
      }

      const result = await deviceGateway.browseDirectory({
        cursor: input.cursor,
        deviceId: input.deviceId,
        limit: input.limit,
        path: input.path,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
      return result ?? null;
    }),

  /**
   * Search project files on a remote device. The device performs the match and
   * returns only the result subtree needed by the UI.
   */
  searchProjectFiles: deviceScopeProcedure
    .input(
      z.object({
        changedOnly: z.boolean().optional(),
        deviceId: z.string(),
        excludeIgnored: z.boolean().optional(),
        limit: z.number().int().positive().max(500).optional(),
        query: z.string(),
        scope: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const result = await deviceGateway.searchProjectFiles({
        changedOnly: input.changedOnly,
        deviceId: input.deviceId,
        excludeIgnored: input.excludeIgnored,
        limit: input.limit,
        query: input.query,
        scope: input.scope,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
      if (result)
        await assertWorkspaceRootApproved(
          ctx.deviceModel,
          input.deviceId,
          result.root,
          ctx.workspaceId,
        );
      return result ?? null;
    }),

  /**
   * Read-only local file preview for a file on a remote device. The web client
   * receives render data, not a `localfile://` URL; saving remains unsupported.
   */
  getLocalFilePreview: workspaceFileProcedure
    .input(
      z.object({
        accept: z.enum(['image']).optional(),
        path: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return deviceGateway.getLocalFilePreview({
        accept: input.accept,
        deviceId: input.deviceId,
        path: input.path,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        workingDirectory: input.workingDirectory,
      });
    }),

  copyAssetForPublish: workspaceFileWritableProcedure
    .input(z.object({ from: z.string(), to: z.string() }))
    .mutation(async ({ ctx, input }) =>
      deviceGateway.copyAssetForPublish({
        deviceId: input.deviceId,
        from: input.from,
        to: input.to,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        workingDirectory: input.workingDirectory,
      }),
    ),

  readExternalAssetForPublish: workspaceFileProcedure
    .input(z.object({ path: z.string() }))
    .query(async ({ ctx, input }) =>
      deviceGateway.readExternalAssetForPublish({
        deviceId: input.deviceId,
        path: input.path,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        workingDirectory: input.workingDirectory,
      }),
    ),

  /**
   * Project skills (`.agents/skills` / `.claude/skills`) for a directory on a
   * remote device, via the device's `listProjectSkills` RPC. Powers the
   * Resources tab's skills group in device mode. Returns `null` when offline.
   */
  listProjectSkills: deviceScopeProcedure
    .input(z.object({ deviceId: z.string(), scope: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await deviceGateway.listProjectSkills({
        deviceId: input.deviceId,
        scope: input.scope,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
      return result ?? null;
    }),

  /**
   * Revert a single file in a directory on a remote device, via the device's
   * `revertGitFile` RPC.
   */
  revertGitFile: devicePathWritableProcedure
    .input(z.object({ deviceId: z.string(), filePath: z.string(), path: z.string() }))
    .mutation(async ({ ctx, input }) =>
      deviceGateway.revertGitFile({
        deviceId: input.deviceId,
        filePath: input.filePath,
        path: input.path,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      }),
    ),

  /**
   * Move files/folders within a directory on a remote device, via the device's
   * `moveLocalFiles` RPC. Powers the Files tree's drag-to-move in device mode.
   */
  moveProjectFiles: workspaceFileWritableProcedure
    .input(
      z.object({
        items: z.array(z.object({ newPath: z.string(), oldPath: z.string() })),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return deviceGateway.moveProjectFiles({
        deviceId: input.deviceId,
        items: input.items,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        workingDirectory: input.workingDirectory,
      });
    }),

  /**
   * Rename a single file/folder in a directory on a remote device, via the
   * device's `renameLocalFile` RPC.
   */
  renameProjectFile: workspaceFileWritableProcedure
    .input(
      z.object({
        newName: z.string(),
        path: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return deviceGateway.renameProjectFile({
        deviceId: input.deviceId,
        newName: input.newName,
        path: input.path,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        workingDirectory: input.workingDirectory,
      });
    }),

  /**
   * Save edited content back to a file on a remote device, via the device's
   * `writeLocalFile` RPC. Powers remote save in the LocalFile editor.
   */
  writeProjectFile: workspaceFileWritableProcedure
    .input(
      z.object({
        content: z.string(),
        path: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return deviceGateway.writeProjectFile({
        content: input.content,
        deviceId: input.deviceId,
        path: input.path,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        workingDirectory: input.workingDirectory,
      });
    }),

  /**
   * Check whether a path exists on a remote device and is a directory, via the
   * device's `statPath` RPC. Lets a web client validate a manually-entered
   * working directory before binding it. Returns `null` when the device is
   * unreachable (caller treats "can't verify" as non-blocking).
   */
  statPath: deviceProcedure
    .input(z.object({ deviceId: z.string(), path: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await deviceGateway.statPath({
        deviceId: input.deviceId,
        path: input.path,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
      return result ?? null;
    }),

  /**
   * Fetch the agent profile (title, description, avatar) from the platform
   * installed on the given device. Used to pre-fill the creation modal.
   * Returns an empty object on failure or when the platform has no profile.
   */
  getAgentProfile: deviceWritableProcedure
    .input(
      z.object({
        deviceId: z.string(),
        platform: remotePlatformEnum,
      }),
    )
    .query(async ({ ctx, input }) => {
      const result = await deviceGateway.executeToolCall(
        { deviceId: input.deviceId, userId: ctx.userId, workspaceId: ctx.workspaceId },
        {
          apiName: 'getAgentProfile',
          arguments: JSON.stringify({ platform: input.platform }),
          identifier: 'local',
        },
        PROFILE_TIMEOUT_MS,
      );

      if (!result.success) return {};

      try {
        return JSON.parse(result.content) as {
          avatar?: string;
          description?: string;
          title?: string;
        };
      } catch {
        return {};
      }
    }),

  getDeviceSystemInfo: deviceProcedure
    .input(z.object({ deviceId: z.string() }))
    .query(async ({ ctx, input }) => {
      return deviceGateway.queryDeviceSystemInfo(ctx.userId, input.deviceId, ctx.workspaceId);
    }),

  /** Agent settings and unbound admission share installed-runtime eligibility. */
  listAgentCandidates: deviceProcedure
    .input(z.object({ agentId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const meta = await getResourceMeta(ctx.serverDB, 'agent', input.agentId);
      if (
        !meta ||
        !(ctx.workspaceId
          ? isWorkspaceScopedMeta(meta, ctx.workspaceId, ctx.userId)
          : meta.workspaceId === null && meta.userId === ctx.userId)
      )
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' });
      const canManageDiscovery =
        !ctx.workspaceId ||
        (await canManageResourcePermission({
          db: ctx.serverDB,
          resourceId: input.agentId,
          resourceType: 'agent',
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          meta,
        }));
      if (!canManageDiscovery)
        await assertCanUseWorkspaceAgent({
          agentId: input.agentId,
          db: ctx.serverDB,
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
        });
      // Use admission permits a selected legacy private Agent without exposing its config.
      const agent = canManageDiscovery
        ? await ctx.agentModel.getAgentConfigById(input.agentId)
        : await ctx.agentModel.getAgentConfigForExecution(input.agentId);
      if (!agent) throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' });
      const agencyConfig = resolveAgentAgencyConfig(agent.agencyConfig);
      const provider = agencyConfig?.heterogeneousProvider;
      const type = provider?.type ?? 'orvilo';
      const inventory = await listAuthorizedDeviceCandidates(
        ctx.serverDB,
        ctx.userId,
        ctx.workspaceId,
        {
          agentOwnerId: agent.userId,

          referencedDevices: [{ deviceId: agencyConfig?.boundDeviceId }],
          requiredOperation: { kind: 'agent-run', adapter: type },
          runtimeRequirement: { agentType: type, command: provider?.command },
        },
      );
      const candidateIds = new Set(inventory.candidates.map((candidate) => candidate.deviceId));
      const rows = (await ctx.deviceModel.queryForExecution()).filter((row) =>
        candidateIds.has(row.deviceId),
      );
      return {
        ...inventory,
        devices: rows.map((row) => ({
          deviceId: row.deviceId,
          friendlyName: row.friendlyName,
          hostname: row.hostname,
          platform: row.platform,
          online:
            inventory.candidates.find((candidate) => candidate.deviceId === row.deviceId)?.online ??
            false,
          channels: [],
          defaultCwd: row.defaultCwd,
          enroller: { userId: row.userId, avatar: null, fullName: null, username: null },
          identitySource: row.identitySource,
          lastSeen: row.lastSeenAt.toISOString(),
          registered: true,
          workingDirs: (row.workingDirs ?? []).map(({ workspace: _workspace, ...rest }) => rest),
        })),
      };
    }),

  /**
   * All devices the user has ever registered (incl. offline). A device is keyed
   * by its `deviceId`; the gateway's live WS sessions are NOT separate devices —
   * each session is surfaced as a `channel` nested under its device. A single
   * device may therefore hold multiple channels (e.g. desktop app + CLI both
   * connected at once), and `online` is simply "has at least one live channel".
   *
   * Personal scope is a union rather than only DB rows: auto-registration may
   * briefly lag a live socket. Workspace scope fails closed on visible registry
   * rows because the row is the enrollment and authorization boundary.
   */
  listDevices: deviceProcedure.query(async ({ ctx }): Promise<DeviceListItem[]> => {
    const [rows, online, owners] = await Promise.all([
      ctx.deviceModel.query(),
      deviceGateway.queryDeviceList(ctx.userId),
      UserModel.findByIds(ctx.serverDB, [ctx.userId]),
    ]);
    const liveById = new Map(online.map((device) => [device.deviceId, device]));
    const owner = owners[0];
    return sortDevicesByActivity(
      rows.map((row) => {
        const live = liveById.get(row.deviceId);
        return {
          channels: (live?.channels ?? []).map((channel) => ({
            channel: channel.channel ?? null,
            connectedAt: channel.connectedAt,
            hostname: live?.hostname ?? row.hostname,
            platform: live?.platform ?? row.platform,
          })),
          defaultCwd: row.defaultCwd,
          deviceId: row.deviceId,
          enroller: owner
            ? {
                avatar: owner.avatar ?? null,
                fullName: owner.fullName ?? null,
                username: owner.username ?? null,
                userId: owner.id,
              }
            : null,
          friendlyName: row.friendlyName,
          hostname: live?.hostname ?? row.hostname,
          identitySource: row.identitySource,
          lastSeen: live?.lastSeen ?? row.lastSeenAt.toISOString(),
          online: !!live,
          platform: live?.platform ?? row.platform,
          registered: true,
          workingDirs: (row.workingDirs ?? []).map(({ workspace: _workspace, ...rest }) => rest),
        };
      }),
    );
  }),

  /**
   * Auto-register the calling device (desktop after OIDC login / CLI on first
   * `orvilo connect`). Upserts on (userId, deviceId); user-owned fields are
   * preserved on conflict.
   */
  /**
   * Device-scoped MCP manifest probe for streamable-HTTP servers — the
   * remote counterpart of the desktop IPC. A localhost / LAN URL only
   * resolves in the device's own network space, so the query executes ON
   * the device via the gateway RPC relay.
   */
  getStreamableMcpServerManifest: deviceMcpProcedure
    .input(
      z.object({
        deviceId: z.string(),
        input: z.object({
          auth: z
            .object({
              accessToken: z.string().optional(),
              token: z.string().optional(),
              type: z.enum(['none', 'bearer', 'oauth2']),
            })
            .optional(),
          headers: z.record(z.string(), z.string()).optional(),
          identifier: z.string(),
          metadata: z
            .object({
              avatar: z.string().optional(),
              description: z.string().optional(),
              name: z.string().optional(),
            })
            .optional(),
          url: z.string(),
        }),
      }),
    )
    .query(async ({ ctx, input }) => {
      const result = await deviceGateway.mcpGetStreamableManifest({
        deviceId: input.deviceId,
        input: input.input,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
      if (result.error) deviceMcpFailure(result.error);
      return deserializeMcpIpcPayload(result.data);
    }),

  /** Device-scoped stdio MCP manifest probe — spawn + listManifests on the device. */
  getStdioMcpServerManifest: deviceMcpProcedure
    .input(
      z.object({
        deviceId: z.string(),
        input: z.object({
          args: z.array(z.string()).optional(),
          command: z.string(),
          env: z.record(z.string(), z.string()).optional(),
          metadata: z
            .object({
              avatar: z.string().optional(),
              description: z.string().optional(),
              name: z.string().optional(),
            })
            .optional(),
          name: z.string(),
        }),
      }),
    )
    .query(async ({ ctx, input }) => {
      const result = await deviceGateway.mcpGetStdioManifest({
        deviceId: input.deviceId,
        input: input.input,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
      if (result.error) deviceMcpFailure(result.error);
      return deserializeMcpIpcPayload(result.data);
    }),

  /** Device-scoped MCP installability check — dependencies live where the server will run. */
  checkMcpInstallable: deviceMcpProcedure
    .input(
      z.object({
        deploymentOptions: z.array(z.any()),
        deviceId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const result = await deviceGateway.mcpCheckInstallable({
        deploymentOptions: input.deploymentOptions,
        deviceId: input.deviceId,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
      if (result.error) deviceMcpFailure(result.error);
      return deserializeMcpIpcPayload(result.data);
    }),

  /**
   * Tunnel an MCP tool call to the device — the explicit-target counterpart
   * of `tools.mcp.callTool`. Stdio commands and localhost / LAN endpoints
   * only run where the MCP server is, so the call rides the
   * `/api/device/tool-call` relay (`type:'mcp'`) instead of the cloud's own
   * MCP client. Executes tools with side effects — member role required in
   * workspace scope.
   */
  callMcpTool: deviceMcpProcedure
    .use(requireWorkspaceRole('member'))
    .input(
      z.object({
        apiName: z.string(),
        arguments: z.string(),
        deviceId: z.string(),
        identifier: z.string(),
        params: gatewayMcpParamsSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await deviceGateway.callDeviceMcpTool({
        apiName: input.apiName,
        arguments: input.arguments,
        deviceId: input.deviceId,
        identifier: input.identifier,
        params: input.params,
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
      });
      if (!result.success) deviceMcpFailure(result.error);
      return result;
    }),

  register: personalDeviceProcedure
    .input(
      z.object({
        adapterVersion: z.string().max(32).nullish(),
        deviceId: z.string().min(1).max(64),
        hostname: z.string().nullish(),
        identitySource: z.enum(['machine-id', 'fallback']),
        platform: z.string().max(20).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.deviceModel.register(input);
    }),

  removeDevice: personalDeviceProcedure
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.deviceModel.delete(input.deviceId);
      return { success: true };
    }),

  status: deviceProcedure.query(async ({ ctx }) => {
    return deviceGateway.queryDeviceStatus(ctx.userId);
  }),

  /** User-editable fields only — never the machine-reported identity columns. */
  updateDevice: personalDeviceProcedure
    .input(
      z.object({
        defaultCwd: z.string().nullish(),
        deviceId: z.string(),
        friendlyName: z.string().max(100).nullish(),
        workingDirs: z.array(workingDirConfigSchema).max(20).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { deviceId, workingDirs, ...value } = input;
      if (!(await ctx.deviceModel.findByDeviceId(deviceId)))
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Device not found.' });

      // The workspace-init cache (workspace / workspaceScannedAt) is stripped
      // from `workingDirs` by the strict schema above, so re-attach it from the
      // stored row by path — otherwise an ordinary cwd save wipes the cache.
      const nextWorkingDirs = workingDirs
        ? preserveWorkspaceCache(
            workingDirs,
            (await ctx.deviceModel.query()).find((device) => device.deviceId === deviceId)
              ?.workingDirs ?? [],
          )
        : undefined;

      await ctx.deviceModel.update(deviceId, { ...value, workingDirs: nextWorkingDirs });
      return { success: true };
    }),
});
