import { TaskIdentifier } from '@orvilo/builtin-skills';
import { BriefIdentifier } from '@orvilo/builtin-tool-brief';
import { TaskIdentifier as TaskToolIdentifier } from '@orvilo/builtin-tool-task';
import { canMountBuiltinToolSurface } from '@orvilo/heterogeneous-agents';
import { automationReadinessResultSchema } from '@orvilo/heterogeneous-agents/automationReadiness';
import type { McpEventBinding, TaskItem } from '@orvilo/types';
import { getActivePluginIds, TERMINAL_AGENT_OPERATION_STATUSES } from '@orvilo/types';
import { isRecord } from '@orvilo/utils/object';
import { and, desc, eq, gte, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';

import { evaluateFeatureFlag } from '@/config/featureFlags';
import { AgentModel } from '@/database/models/agent';
import { ConnectorModel } from '@/database/models/connector';
import { DeviceModel } from '@/database/models/device';
import { ProviderBindingModel } from '@/database/models/providerBinding';
import { agentOperations, ConnectorStatus, messages } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { findUsableAgentExecutionBinding } from '@/database/utils/agent-access';
import { snapshotAutomationDefinition } from '@/database/utils/automationOccurrence';
import { getServerFeatureFlagsFromRuntimeConfig } from '@/server/featureFlags';
import { resolveExternalToolSurface } from '@/server/services/aiAgent/pipeline/resolveExternalToolSurface';
import { resolveRunToolSurface } from '@/server/services/aiAgent/pipeline/runToolSurface';
import { resolveDeviceWorkingDirectory } from '@/server/services/aiAgent/resolveDeviceWorkingDirectory';
import {
  getGitHubMcpGrantIdentity,
  isGitHubMcpConnector,
} from '@/server/services/connector/githubMcp';
import { deviceGateway } from '@/server/services/deviceGateway';
import { createProviderBindingComposition } from '@/server/services/providerBinding/controlPlane';
import { resolveOrviloProviderBinding } from '@/server/services/providerBinding/execution';

import { getMcpEventWorkerHealth } from './workerHealth';
import type { McpEventTrigger } from './workerRepository';

export type AutomationReadinessCode =
  | 'ACCEPTANCE_REQUIRED'
  | 'CONFIGURATION_INVALID'
  | 'CONNECTOR_REVOKED'
  | 'SOURCE_VERIFICATION_REQUIRED'
  | 'AUTH_REQUIRED'
  | 'DEVICE_UNAVAILABLE'
  | 'DEVICE_SELECTION_REQUIRED'
  | 'EXECUTOR_UNSUPPORTED'
  | 'EXECUTOR_UNVERIFIED'
  | 'REQUIRED_TOOLS_UNSUPPORTED'
  | 'REPOSITORY_UNAVAILABLE'
  | 'WORKER_UNHEALTHY';

export interface AutomationReadiness {
  canEnable: boolean;
  definitionVersionId: string;
  deviceId?: string;
  devices: { id: string; name: string }[];
  reasons: AutomationReadinessCode[];
  triggerRevision: number;
}

/** Readiness observes the same identity and tool surface used by execAgent; it never starts a run. */
export async function checkMcpAutomationReadiness(input: {
  db: OrviloDatabase;
  task: TaskItem;
  trigger: McpEventTrigger;
  binding?: McpEventBinding;
  deviceId?: string;
}): Promise<AutomationReadiness> {
  const { db, task, trigger, binding } = input;
  const reasons: AutomationReadinessCode[] = [];
  if (binding?.sourceType !== 'github') {
    const flags = await getServerFeatureFlagsFromRuntimeConfig(trigger.userId);
    if (evaluateFeatureFlag(flags.mcp_event_automations, trigger.userId) !== true)
      reasons.push('ACCEPTANCE_REQUIRED');
  }
  const scope = { userId: trigger.userId, workspaceId: trigger.workspaceId };
  const config = isRecord(task.config) ? task.config : {};
  const workspace = isRecord(config.workspace) ? config.workspace : {};
  if (
    task.automationMode !== 'event' ||
    !task.instruction.trim() ||
    task.workspaceId !== trigger.workspaceId ||
    task.id !== trigger.taskId
  )
    reasons.push('CONFIGURATION_INVALID');
  if (
    !binding ||
    binding.state === 'revoked' ||
    binding.tenantId !== trigger.tenantId ||
    binding.connectorId !== trigger.sourceId ||
    binding.id !== trigger.subscriptionId ||
    (binding.expiresAt !== null && binding.expiresAt <= Date.now())
  )
    reasons.push('CONNECTOR_REVOKED');
  else if (binding.state !== 'active')
    reasons.push(
      binding.sourceType === 'github' ? 'SOURCE_VERIFICATION_REQUIRED' : 'CONNECTOR_REVOKED',
    );
  if ((await getMcpEventWorkerHealth()).status !== 'ready') reasons.push('WORKER_UNHEALTHY');

  const source = await new ConnectorModel(db, trigger.userId, trigger.workspaceId).findById(
    trigger.sourceId,
  );
  if (!source || !source.isEnabled || source.status !== ConnectorStatus.connected || source.agentId)
    reasons.push('CONNECTOR_REVOKED');
  if (binding?.sourceType === 'github') {
    const grant =
      source && isGitHubMcpConnector(source)
        ? await getGitHubMcpGrantIdentity({ connector: source, db })
        : null;
    if (
      !binding.github ||
      !grant ||
      grant.githubUserId !== binding.github.githubUserId ||
      grant.grantRevision !== binding.github.grantRevision
    )
      reasons.push('CONNECTOR_REVOKED');
  }

  const deviceModel = new DeviceModel(db, trigger.userId, trigger.workspaceId);
  const [workspaceRows, personalRows, workspaceOnline, personalOnline] = await Promise.all([
    deviceModel.queryWorkspaceDevices(),
    deviceModel.queryPersonal(),
    deviceGateway.queryDeviceList(trigger.userId, trigger.workspaceId),
    deviceGateway.queryDeviceList(trigger.userId),
  ]);
  const workspaceOnlineIds = new Set(workspaceOnline.map((device) => device.deviceId));
  const personalOnlineIds = new Set(personalOnline.map((device) => device.deviceId));
  const rows = [
    ...workspaceRows,
    ...personalRows.filter(
      (row) => !workspaceRows.some((workspace) => workspace.deviceId === row.deviceId),
    ),
  ];
  const onlineIds = new Set(
    rows
      .filter((row) =>
        workspaceRows.includes(row)
          ? workspaceOnlineIds.has(row.deviceId)
          : personalOnlineIds.has(row.deviceId),
      )
      .map((row) => row.deviceId),
  );
  const devices = rows
    .filter((row) => onlineIds.has(row.deviceId))
    .map((row) => ({ id: row.deviceId, name: row.hostname ?? row.deviceId }));
  const agentBinding = task.assigneeAgentId
    ? await findUsableAgentExecutionBinding(db, task.assigneeAgentId, scope)
    : null;
  const agent =
    agentBinding && task.assigneeAgentId
      ? await new AgentModel(db, trigger.userId, trigger.workspaceId).getAgentConfig(
          task.assigneeAgentId,
        )
      : null;
  if (!agent) reasons.push('AUTH_REQUIRED');
  const agency = agent?.agencyConfig;
  const pinned =
    typeof config.automationDeviceId === 'string'
      ? config.automationDeviceId
      : typeof workspace.deviceId === 'string'
        ? workspace.deviceId
        : agency?.boundDeviceId;
  // A pinned target is never replaced by another available machine.
  const deviceId = pinned ?? input.deviceId ?? (devices.length === 1 ? devices[0].id : undefined);
  if (pinned && input.deviceId && pinned !== input.deviceId) reasons.push('CONFIGURATION_INVALID');
  if (!deviceId)
    reasons.push(devices.length > 1 ? 'DEVICE_SELECTION_REQUIRED' : 'DEVICE_UNAVAILABLE');
  else if (!devices.some((device) => device.id === deviceId)) reasons.push('DEVICE_UNAVAILABLE');
  if (agency?.executionTargetSelectionPolicy === 'fixed' && agency.boundDeviceId !== deviceId)
    reasons.push('CONFIGURATION_INVALID');

  if (
    agent &&
    deviceId &&
    onlineIds.has(deviceId) &&
    devices.some((device) => device.id === deviceId)
  ) {
    const provider = agency?.heterogeneousProvider ?? { type: 'orvilo' };
    const type = provider.type ?? 'orvilo';
    const requiredToolIds = [
      TaskIdentifier,
      TaskToolIdentifier,
      ...getActivePluginIds(agent.plugins ?? undefined),
    ];
    const review = isRecord(config.review) ? config.review : {};
    const checkpoint = isRecord(config.checkpoint) ? config.checkpoint : {};
    if (
      isRecord(config.brief) &&
      config.brief.mode === 'agent' &&
      !review.enabled &&
      checkpoint.onAgentRequest !== false
    )
      requiredToolIds.push(BriefIdentifier);
    const externalTools = await resolveExternalToolSurface({
      ...scope,
      db,
      agentId: agent.id,
      candidateIds: requiredToolIds,
    });
    const surface = resolveRunToolSurface({
      agentPlugins: agent.plugins ?? undefined,
      enableAgentMode: agent.chatConfig?.enableAgentMode,
      requiredToolIds,
      externalTools,
      supportsBuiltinToolMount: canMountBuiltinToolSurface({ type }),
    });
    if (surface.outcomes.some((outcome) => outcome.status !== 'mounted'))
      reasons.push('REQUIRED_TOOLS_UNSUPPORTED');
    const deviceRow = rows.find((row) => row.deviceId === deviceId);
    const cwd =
      typeof workspace.repoPath === 'string'
        ? workspace.repoPath
        : resolveDeviceWorkingDirectory({
            deviceId,
            deviceDefaultCwd: deviceRow?.defaultCwd,
            workingDirByDevice: agency?.workingDirByDevice,
          });
    const deviceWorkspaceId = workspaceRows.some((row) => row.deviceId === deviceId)
      ? trigger.workspaceId
      : undefined;
    const response = await deviceGateway.executeToolCall(
      { userId: trigger.userId, workspaceId: deviceWorkspaceId, deviceId },
      {
        identifier: 'local',
        apiName: 'checkAutomationReadiness',
        arguments: JSON.stringify({
          agentType: type,
          engine: provider.engine,
          model: provider.model,
          cwd,
          requiredTools: [],
        }),
      },
      10_000,
    );
    let observed: Record<string, unknown> = {};
    try {
      if (response.success) {
        const parsed = automationReadinessResultSchema.safeParse(JSON.parse(response.content));
        if (parsed.success) observed = parsed.data;
      }
    } catch {
      /* Malformed or older hosts remain unverified. */
    }
    if (Array.isArray(observed.blockers) && observed.blockers.includes('EXECUTOR_UNSUPPORTED'))
      reasons.push('EXECUTOR_UNSUPPORTED');
    if (observed.installed !== true || observed.unattended !== true)
      reasons.push('EXECUTOR_UNVERIFIED');
    if (observed.requiredToolsSupported !== true) reasons.push('REQUIRED_TOOLS_UNSUPPORTED');
    if (cwd && observed.repositoryAccessible !== true) reasons.push('REPOSITORY_UNAVAILABLE');
    let authenticated = observed.authenticated === true;
    if (
      type === 'opencode' &&
      observed.executor === 'opencode' &&
      observed.authenticated === 'unknown' &&
      observed.credentialRequired !== false &&
      provider.model &&
      cwd &&
      agent.updatedAt
    ) {
      // ponytail: recent successful ACP execution proves this unchanged route;
      // credential revocation and host binary changes still require a new run.
      const [latest] = await db
        .select({
          status: agentOperations.status,
          completionReason: agentOperations.completionReason,
          model: agentOperations.model,
          sessionId: sql<
            string | null
          >`${agentOperations.metadata}->'remoteAdmission'->>'acpSessionId'`,
          hasOutput: sql<boolean>`coalesce(${messages.content}, '') ~ '[^[:space:]]'`,
        })
        .from(agentOperations)
        .leftJoin(
          messages,
          and(
            eq(messages.id, sql`${agentOperations.metadata}->>'assistantMessageId'`),
            eq(messages.topicId, agentOperations.topicId),
            eq(messages.userId, trigger.userId),
            eq(messages.workspaceId, trigger.workspaceId),
            eq(messages.role, 'assistant'),
            isNull(messages.deletedAt),
          ),
        )
        .where(
          and(
            eq(agentOperations.userId, trigger.userId),
            eq(agentOperations.workspaceId, trigger.workspaceId),
            eq(agentOperations.agentId, agent.id),
            eq(agentOperations.provider, 'opencode'),
            sql`${agentOperations.metadata}->>'executionEngine' = 'hetero'`,
            sql`${agentOperations.metadata}->>'heteroAgentType' = 'opencode'`,
            sql`${agentOperations.metadata}->'executionPlan'->>'deviceId' = ${deviceId}`,
            sql`${agentOperations.metadata}->'executionPlan'->>'workingDirectoryBinding' = ${cwd}`,
            gte(agentOperations.startedAt, agent.updatedAt),
            isNotNull(agentOperations.completedAt),
            inArray(agentOperations.status, [...TERMINAL_AGENT_OPERATION_STATUSES]),
            // A failure before model negotiation still invalidates older success.
            or(eq(agentOperations.model, provider.model), isNull(agentOperations.model)),
          ),
        )
        .orderBy(desc(agentOperations.completedAt), desc(agentOperations.id))
        .limit(1);
      authenticated =
        latest?.status === 'done' &&
        latest.completionReason === 'done' &&
        latest.model === provider.model &&
        Boolean(latest.sessionId?.trim()) &&
        latest.hasOutput === true;
    }
    // Prime's provider is authorized by the server binding, not a host CLI login.
    // The engine model is retired: the builtin 'orvilo' agent IS the embedded
    // Prime runtime, so a persisted `provider.engine` key is dead data — the
    // server-binding check applies to every orvilo automation on the device.
    if (type === 'orvilo') {
      const row = await resolveOrviloProviderBinding(db, trigger.userId, 'device');
      // The resolver does not narrow on the bound device — the stale selector
      // pinned the target device, so keep that check here.
      const boundHere = row?.config?.selection?.deviceId === deviceId;
      if (
        boundHere &&
        row?.config.enabled &&
        (await new ProviderBindingModel(db, trigger.userId).ownsCredentialReference(
          row.config.secretReference,
        ))
      ) {
        const composition = createProviderBindingComposition(db);
        const checked = await composition.broker.checkBinding({
          schemaVersion: 1,
          scope: await composition.authorizeScope(trigger.userId),
          bindingId: row.id,
          bindingRevision: row.revision,
        });
        authenticated = checked.ok && checked.value.status === 'ready';
      } else authenticated = false;
    }
    if (!authenticated) reasons.push('AUTH_REQUIRED');
  }
  return {
    canEnable: reasons.length === 0,
    definitionVersionId: snapshotAutomationDefinition(task).definitionVersionId,
    triggerRevision: trigger.revision,
    deviceId,
    devices,
    reasons: [...new Set(reasons)],
  };
}
