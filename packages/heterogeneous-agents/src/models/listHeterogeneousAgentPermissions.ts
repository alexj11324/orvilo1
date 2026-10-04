import path from 'node:path';

import type {
  HeterogeneousAgentPermissionCatalog,
  ListHeterogeneousAgentPermissionsParams,
} from '@orvilo/types';

import { ACP_RUNTIME_AGENT_TYPES } from '../spawn/acpRuntime';
import { resolveHeteroSpawnCommand } from '../spawn/resolveCliCommand';
import { listStandardAcpPermissions, resolveAcpSpawnTarget } from '../spawn/standardAcpAgents';

/** Discover only permission options advertised by the selected ACP harness. */
export const listHeterogeneousAgentPermissions = async (
  params: ListHeterogeneousAgentPermissionsParams,
): Promise<HeterogeneousAgentPermissionCatalog[]> => {
  if (!ACP_RUNTIME_AGENT_TYPES.has(params.type)) return [];

  const resolved = await resolveHeteroSpawnCommand(params.type, params.command);
  const callerEnv = params.env ?? process.env;
  const mergedPath = [
    ...new Set(
      [callerEnv.PATH, resolved.pathEnv].filter(Boolean).join(path.delimiter).split(path.delimiter),
    ),
  ]
    .filter(Boolean)
    .join(path.delimiter);
  const env = { ...callerEnv, ...(mergedPath ? { PATH: mergedPath } : {}) };
  const target = await resolveAcpSpawnTarget(params.type, resolved.command, env);

  return listStandardAcpPermissions(params.type, {
    args: params.args,
    commandArgs: target.commandArgs,
    commandPath: target.commandPath,
    cwd: params.cwd ?? process.cwd(),
    env: target.env,
    timeoutMs: 15_000,
  });
};
