import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';

import { probePrimeArtifactInstallation } from '@orvilo/prime-harness/readiness';
import { resolveHeteroCliAgentType } from '@orvilo/types';
import { z } from 'zod';

import { getHeterogeneousAgentConfig } from '../config';
import { resolveCliSpawnPlan } from '../spawn/cliSpawn';
import { detectHeterogeneousCliCommand } from '../spawn/resolveCliCommand';
import { isSpawnableDirectory } from '../spawn/workingDirectory';
import { resolveRemotePlatformCommand } from './scanHost';

export const automationReadinessRequestSchema = z.object({
  agentType: z.string().min(1).max(80),
  cwd: z.string().min(1).max(4096).optional(),
  engine: z.string().max(80).optional(),
  model: z.string().min(1).max(200).optional(),
  requiredTools: z.array(z.string().min(1).max(200)).max(100).optional(),
});

export type AutomationReadinessRequest = z.infer<typeof automationReadinessRequestSchema>;
const capabilitySchema = z.union([z.boolean(), z.literal('unknown')]);
export type AutomationCapability = z.infer<typeof capabilitySchema>;
export const automationReadinessResultSchema = z.object({
  authenticated: capabilitySchema,
  blockers: z.array(z.enum(['EXECUTOR_UNSUPPORTED'])).optional(),
  checkedAt: z.iso.datetime(),
  credentialRequired: capabilitySchema.optional(),
  executor: z.string().min(1),
  installed: capabilitySchema,
  repositoryAccessible: capabilitySchema,
  requiredToolsSupported: capabilitySchema,
  unattended: capabilitySchema,
});
export type AutomationReadinessResult = z.infer<typeof automationReadinessResultSchema>;

/** Read-only commands only: no prompts, sessions, login, credential reads or tool execution. */
const runProbe = async (
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeout = 1500,
): Promise<{ failed: boolean; output: string }> => {
  const plan = await resolveCliSpawnPlan(command, args, env);
  return new Promise((resolve) => {
    execFile(
      plan.command,
      plan.args,
      { encoding: 'utf8', env, maxBuffer: 64 * 1024, timeout, windowsHide: true },
      (error, stdout, stderr) =>
        resolve({ failed: Boolean(error), output: `${stdout}\n${stderr}` }),
    );
  });
};

/** CLI-filtered active public Zen models require no user login or API key. */
const isPublicOpenCodeModel = (output: string, model?: string): boolean => {
  if (!model?.startsWith('opencode/')) return false;
  const lines = output.split('\n');
  const index = lines.findIndex((line) => line.trim() === model);
  if (index < 0) return false;
  const next = lines.findIndex(
    (line, offset) => offset > index && /^opencode\/\S+$/.test(line.trim()),
  );
  try {
    const entry = JSON.parse(lines.slice(index + 1, next < 0 ? undefined : next).join('\n'));
    return (
      entry.providerID === 'opencode' &&
      `opencode/${entry.id}` === model &&
      entry.status === 'active' &&
      entry.cost?.input === 0 &&
      entry.cost?.output === 0 &&
      entry.api?.url === 'https://opencode.ai/zen/v1' &&
      Object.keys(entry.headers ?? {}).length === 0 &&
      Object.keys(entry.options ?? {}).length === 0
    );
  } catch {
    return false;
  }
};

const checkDirectory = async (cwd?: string): Promise<boolean> => {
  if (!cwd) return true;
  if (!path.isAbsolute(cwd) || !isSpawnableDirectory(cwd)) return false;
  try {
    await access(cwd, constants.R_OK | constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * Evidence about the bound host, not a reservation or permission grant. The
 * server still validates identity, allowed tools and provider credentials.
 * A readable cwd proves local directory access, not access to a remote origin.
 * Unsupported credential/tool introspection stays unknown and must block enable.
 */
export async function checkAutomationReadinessOnHost(
  input: AutomationReadinessRequest,
): Promise<AutomationReadinessResult> {
  const params = automationReadinessRequestSchema.parse(input);
  const engineSupported =
    !params.engine || params.engine === 'claude-sdk' || params.engine === 'codex-app-server';
  const executor =
    params.agentType === 'orvilo' && engineSupported
      ? resolveHeteroCliAgentType({ type: params.agentType })
      : params.agentType === 'native' || params.engine === 'prime'
        ? 'prime'
        : params.agentType;
  const result: AutomationReadinessResult = {
    authenticated: 'unknown',
    checkedAt: new Date().toISOString(),
    executor,
    installed: 'unknown',
    repositoryAccessible: await checkDirectory(params.cwd),
    requiredToolsSupported: params.requiredTools?.length ? 'unknown' : true,
    unattended: 'unknown',
  };

  // Prime is an executor, not a fixed host. Its bundle may be installed on
  // this device, but current device agent_run handlers only dispatch CLI
  // families. Provider credentials are attested separately by the server.
  if (executor === 'prime') {
    result.installed = (await probePrimeArtifactInstallation()).installed;
    result.unattended = false;
    result.blockers = ['EXECUTOR_UNSUPPORTED'];
    return result;
  }
  if (params.agentType === 'orvilo' && !engineSupported) {
    result.blockers = ['EXECUTOR_UNSUPPORTED'];
    return result;
  }

  const config = getHeterogeneousAgentConfig(executor);
  const status = config
    ? await detectHeterogeneousCliCommand(config.type, config.defaultCommand)
    : await resolveRemotePlatformCommand(executor);
  result.installed = status.available;
  if (!status.available || !status.path) return result;

  const env = { ...process.env, ...(status.resolvedPathEnv && { PATH: status.resolvedPathEnv }) };
  if (executor === 'opencode') {
    try {
      const [acp, run, catalog] = await Promise.all([
        runProbe(status.path, ['acp', '--help'], env),
        runProbe(status.path, ['run', '--help'], env),
        runProbe(status.path, ['models', 'opencode', '--verbose'], env, 5000),
      ]);
      if (!acp.failed && !run.failed) {
        result.unattended =
          /Agent Client Protocol/.test(acp.output) &&
          /--format\b/.test(run.output) &&
          /--model\b/.test(run.output);
      }
      // Keyless model configuration is distinct from permission to use it
      // through Orvilo ACP. Real OpenCode 1.18.34 calls reject external ACP
      // clients on the public tier, despite listing those models here. Keep
      // authenticated unknown until this execution route can be attested.
      // Never infer authentication from credentials existing on disk.
      if (!catalog.failed && isPublicOpenCodeModel(catalog.output, params.model))
        result.credentialRequired = false;
    } catch {
      // Unsupported/failed CLI introspection remains unknown.
    }
    return result;
  }
  // Other adapters have no read-only authentication contract yet.
  if (executor !== 'codex' && executor !== 'claude-code') return result;
  try {
    const [auth, help] = await Promise.all([
      runProbe(
        status.path,
        executor === 'codex' ? ['login', 'status'] : ['auth', 'status', '--json'],
        env,
      ),
      runProbe(status.path, executor === 'codex' ? ['exec', '--help'] : ['--help'], env),
    ]);
    if (executor === 'claude-code') {
      try {
        const parsed = JSON.parse(auth.output.trim()) as { loggedIn?: unknown };
        if (typeof parsed.loggedIn === 'boolean' && (!auth.failed || !parsed.loggedIn))
          result.authenticated = parsed.loggedIn;
      } catch {
        // Unsupported version, timeout or unexpected output is not auth proof.
      }
    } else if (/\bnot logged in\b/i.test(auth.output)) {
      result.authenticated = false;
    } else if (!auth.failed && /\blogged in\b/i.test(auth.output)) {
      result.authenticated = true;
    }
    if (!help.failed) {
      const headlessSupported =
        executor === 'codex'
          ? /\b(?:Usage:.*exec|Run Codex non-interactively)\b/i.test(help.output)
          : /--print\b/.test(help.output) && /--permission-mode\b/.test(help.output);
      result.unattended = headlessSupported;
    }
  } catch {
    // Shell-free spawn plan or probe failed: preserve unknown evidence.
  }
  return result;
}
