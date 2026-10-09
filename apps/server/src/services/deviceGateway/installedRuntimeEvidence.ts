import type { OrviloDatabase } from '@orvilo/database';
import type { HeterogeneousAgentScanMap } from '@orvilo/heterogeneous-agents';
import { automationReadinessResultSchema } from '@orvilo/heterogeneous-agents/automationReadiness';
import type { DeviceCapabilitySnapshot, DeviceRuntimeInstallationEvidence } from '@orvilo/types';
import { HETEROGENEOUS_AGENT_CONFIGS, REMOTE_HETEROGENEOUS_AGENT_CONFIGS } from '@orvilo/types';
import { z } from 'zod';

import { DeviceModel } from '@/database/models/device';

import { deviceGateway } from './index';

export interface DeviceRuntimeRequirement {
  agentType: string;
  command?: string;
}

interface DeviceRuntimeOwner {
  deviceId: string;
  userId: string;
  workspaceId?: string;
}

const scanResultSchema = z.object({
  agents: z.record(
    z.string(),
    z.object({
      available: z.boolean(),
      reason: z.string().optional(),
      version: z.string().optional(),
    }),
  ),
});

const runtimeType = (type: string) =>
  ['orvilo', 'native', 'prime'].includes(type) ? 'prime' : type;
const defaultCommand = (type: string) =>
  type === 'prime'
    ? 'prime'
    : (HETEROGENEOUS_AGENT_CONFIGS.find((config) => config.type === type)?.defaultCommand ??
      REMOTE_HETEROGENEOUS_AGENT_CONFIGS.find((config) => config.type === type)?.cli.command);

/** An exact installed runtime is a candidate even when its host is offline. */
export const matchDeviceRuntimeInstallation = (
  snapshot: DeviceCapabilitySnapshot | null | undefined,
  requirement: DeviceRuntimeRequirement,
): boolean | 'unknown' => {
  const type = runtimeType(requirement.agentType);
  const command = requirement.command?.trim() || defaultCommand(type);
  const observed = snapshot?.installedRuntimes?.[type];
  if (
    !observed ||
    typeof observed.available !== 'boolean' ||
    !command ||
    observed.command !== command ||
    !Number.isFinite(Date.parse(observed.observedAt))
  )
    return 'unknown';
  return observed.available;
};

/** Reuse the host's existing scanner and persist only successful scan facts. */
export const scanDeviceAgents = async (
  db: OrviloDatabase,
  owner: DeviceRuntimeOwner,
): Promise<{
  agents: HeterogeneousAgentScanMap;
  error?: string;
  snapshot?: DeviceCapabilitySnapshot;
}> => {
  const result = await deviceGateway.executeToolCall(
    owner,
    {
      apiName: 'scanHeterogeneousAgents',
      arguments: '{}',
      identifier: 'local',
    },
    10_000,
  );
  if (!result.success) return { agents: {}, error: result.error ?? 'Device scan failed' };

  let parsed: z.infer<typeof scanResultSchema>;
  try {
    parsed = scanResultSchema.parse(JSON.parse(result.content));
  } catch {
    return { agents: {}, error: 'Invalid runtime scan response from device' };
  }
  const observedAt = new Date().toISOString();
  const installedRuntimes: Record<string, DeviceRuntimeInstallationEvidence> = {};
  for (const [type, status] of Object.entries(parsed.agents)) {
    const command = defaultCommand(type);
    if (!command || type === 'prime') continue;
    installedRuntimes[type] = {
      available: status.available,
      command,
      observedAt,
      ...(status.version ? { version: status.version } : {}),
    };
  }
  if (Object.keys(installedRuntimes).length)
    await new DeviceModel(db, owner.userId, owner.workspaceId).updateRuntimeInstallationEvidence(
      owner.deviceId,
      installedRuntimes,
    );
  return { agents: parsed.agents, snapshot: { installedRuntimes } };
};

/** Installation only: permission, connectivity and launch readiness remain separate. */
export const verifyDeviceRuntimeInstallation = async ({
  db,
  online,
  owner,
  requirement,
  snapshot,
}: {
  db: OrviloDatabase;
  online: boolean;
  owner: DeviceRuntimeOwner;
  requirement: DeviceRuntimeRequirement;
  snapshot?: DeviceCapabilitySnapshot | null;
}): Promise<{ installed: boolean | 'unknown'; error?: string }> => {
  const known = matchDeviceRuntimeInstallation(snapshot, requirement);
  if (!online) return { installed: known };

  const type = runtimeType(requirement.agentType);
  const command = defaultCommand(type);
  if (!command || (requirement.command?.trim() && requirement.command.trim() !== command))
    return {
      installed: known,
      error: 'The configured runtime command has not been verified on this device',
    };

  if (type !== 'prime') {
    const scanned = await scanDeviceAgents(db, owner);
    if (scanned.error) return { installed: known, error: scanned.error };
    const installed = matchDeviceRuntimeInstallation(scanned.snapshot, requirement);
    return {
      installed,
      ...(installed === 'unknown' ? { error: 'Device did not report this runtime' } : {}),
    };
  }

  const result = await deviceGateway.executeToolCall(
    owner,
    {
      apiName: 'checkAutomationReadiness',
      arguments: JSON.stringify({ agentType: 'orvilo', engine: 'prime' }),
      identifier: 'local',
    },
    10_000,
  );
  if (!result.success)
    return { installed: known, error: result.error ?? 'Prime installation check failed' };
  let parsed: z.infer<typeof automationReadinessResultSchema>;
  try {
    parsed = automationReadinessResultSchema.parse(JSON.parse(result.content));
  } catch (error) {
    console.error('[device:verifyPrimeInstallation]', error);
    return { installed: known, error: 'Invalid Prime installation response from device' };
  }
  if (parsed.executor !== 'prime' || parsed.installed === 'unknown')
    return { installed: known, error: 'Device did not verify the Prime installation' };
  await new DeviceModel(db, owner.userId, owner.workspaceId).updateRuntimeInstallationEvidence(
    owner.deviceId,
    {
      prime: { available: parsed.installed, command: 'prime', observedAt: parsed.checkedAt },
    },
  );
  return { installed: parsed.installed };
};
