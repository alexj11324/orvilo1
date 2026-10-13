// @vitest-environment node
import type { ExecAgentResult } from '@orvilo/types';
import { summarizeOrchestrationWorkflowSupervision } from '@orvilo/types';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { AgentModel } from '@/database/models/agent';
import { AgentOperationModel } from '@/database/models/agentOperation';
import { DocumentModel } from '@/database/models/document';
import { OrchestrationWorkflowModel } from '@/database/models/orchestrationWorkflow';
import { OrchestrationWorkflowGraphModel } from '@/database/models/orchestrationWorkflowGraph';
import { ProviderBindingModel } from '@/database/models/providerBinding';
import { TaskModel } from '@/database/models/task';
import { legacyStatusExpr } from '@/database/models/taskExecutionSql';
import { UserModel } from '@/database/models/user';
import { WorkModel } from '@/database/models/work';
import {
  acceptances,
  agentOperations,
  agents,
  credentials,
  devices,
  orchestrationWorkflowEdges,
  orchestrationWorkflowEvents,
  orchestrationWorkflowNodeDecisions,
  orchestrationWorkflowNodes,
  orchestrationWorkflows,
  providerBindings,
  tasks,
  taskTopics,
  topics,
  users,
  userSettings,
} from '@/database/schemas';
import { AiAgentService } from '@/server/services/aiAgent';
import { TaskService } from '@/server/services/task';
import { TaskRunnerService } from '@/server/services/taskRunner';

import { OrchestrationWorkflowService } from '../index';
import * as scheduler from '../scheduler';
import { OrchestrationWorkflowSupervisorService } from './index';
import { OrchestrationWorkflowSupervisorTools } from './tools';

// CAID admission (R10) is enabled in release defaults; orchestrated `trigger:'orchestration workflow'` dispatches
// need it admitted or the tick parks on `waiting_external` before `runTask`.
const caidAdmission = vi.hoisted(() => ({ allowed: vi.fn(async () => true) }));
vi.mock('@/server/featureFlags/caidAdmission', () => ({
  isCaidDispatchAllowed: caidAdmission.allowed,
}));

const db = await getTestDB();
const userId = 'supervisor-test-user';
let sequence = 0;
const operationModel = new AgentOperationModel(db, userId);
const taskModel = new TaskModel(db, userId);
const orchestrationWorkflowModel = new OrchestrationWorkflowModel(db, userId);
const service = () => confirmedService();

/**
 * `tasks.status` is retired — read the derived legacy vocabulary so a fixture
 * asserts the state the supervisor would actually see.
 */
const derivedStatus = async (id: string) => {
  const [row] = await db.select({ status: legacyStatusExpr }).from(tasks).where(eq(tasks.id, id));
  return row?.status;
};

const runResult = (operationId: string, topicId: string, agentId = 'agent'): ExecAgentResult => ({
  agentId,
  assistantMessageId: 'message',
  autoStarted: true,
  createdAt: new Date().toISOString(),
  message: 'started',
  operationId,
  status: 'running',
  success: true,
  timestamp: new Date().toISOString(),
  topicId,
  userMessageId: 'user-message',
});

// Engine tests start from a persisted, already confirmed admission (as historical rows do).
const confirmedService = () => {
  const service = new OrchestrationWorkflowService(db, userId);
  const create = service.create;
  service.create = async (input) => {
    const graph = await create(input);
    const config = {
      ...graph.orchestrationWorkflow.config,
      planConfirmedAt: new Date().toISOString(),
    };
    await new OrchestrationWorkflowModel(db, userId).update(graph.orchestrationWorkflow.id, {
      config,
    });
    graph.orchestrationWorkflow.config = config;
    return graph;
  };
  return service;
};

beforeEach(async () => {
  await db.insert(users).values({ id: userId }).onConflictDoNothing();
  await db
    .insert(devices)
    .values({ userId, deviceId: 'supervisor-host', identitySource: 'fallback' });
  await db.insert(credentials).values({
    id: 'cred_supervisor',
    ownerUserId: userId,
    key: 'supervisor',
    name: 'Fixture',
    type: 'kv-env',
    payload: 'fixture-only',
  });
  await new ProviderBindingModel(db, userId).create({
    enabled: true,
    endpoint: 'https://provider.example/v1',
    model: 'saved-supervisor-model',
    name: 'Fixture',
    provider: 'openai',
    secretReference: 'credential:cred_supervisor',
    selection: {
      runtime: 'orvilo',
      engine: 'claude-sdk',
      effort: 'default',
      mode: 'default',
      speed: 'default',
      target: 'sandbox',
    },
  });
  await new AgentModel(db, userId).create({
    agencyConfig: {
      boundDeviceId: 'supervisor-host',
      executionTarget: 'device',
      heterogeneousProvider: { type: 'orvilo', model: 'saved-supervisor-model' },
    },
    model: 'saved-supervisor-model',
    provider: 'openai',
    title: 'Prime',
  });
  await db.insert(agents).values({
    id: 'supervisor-orchestrator',
    userId,
    agencyConfig: { heterogeneousProvider: { type: 'codex' } },
  });
  await new UserModel(db, userId).updatePreference({
    orchestratorAgentId: 'supervisor-orchestrator',
  });
  vi.spyOn(scheduler, 'scheduleOrchestrationWorkflowAdvance').mockResolvedValue();
  vi.spyOn(AiAgentService.prototype, 'execAgent').mockImplementation(async (params) => {
    const id = `op-supervisor-${++sequence}`;
    const topicId = params.appContext!.topicId!;
    await operationModel.recordStart({
      agentId: params.agentId,
      appContext: { sourceMessageId: params.clientIds?.userMessageId },
      operationId: id,
      topicId,
    });
    return runResult(id, topicId, params.agentId);
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete(orchestrationWorkflowNodeDecisions);
  await db.delete(orchestrationWorkflowEdges);
  await db.delete(orchestrationWorkflowEvents);
  await db.delete(orchestrationWorkflowNodes);
  await db.delete(orchestrationWorkflows);
  await db.delete(acceptances);
  await db.delete(agentOperations);
  await db.delete(taskTopics);
  await db.delete(topics);
  await db.delete(tasks);
  await db.delete(agents);
  await db.delete(users);
});

/**
 * `initialize` inherits an orvilo-typed Prime runtime, which is mount-incapable
 * by design — `canMountBuiltinToolSurface` refuses 'orvilo' and the held
 * capability decision keeps it that way. These flows exercise supervisor
 * dispatch mechanics (diagnosis, cancellation, adoption), not the gate itself,
 * so each orchestration workflow gets a pre-seeded supervisorState whose agent resolves a
 * mount-capable runtime; `initialize` returns the existing state verbatim.
 */
const seedSupervisorAgent = async (orchestrationWorkflowId: string) => {
  const agent = await new AgentModel(db, userId).create({
    agencyConfig: {
      boundDeviceId: 'supervisor-host',
      executionTarget: 'device',
      heterogeneousProvider: { model: 'saved-supervisor-model', type: 'claude-code' },
    },
    model: 'saved-supervisor-model',
    provider: 'openai',
    title: 'Orchestration workflow Supervisor Seed',
    visibility: 'private',
    virtual: true,
  });
  const topicId = `topic-supervisor-${++sequence}`;
  await db.insert(topics).values({ id: topicId, userId });
  const state = await orchestrationWorkflowModel.updateSupervisorState(orchestrationWorkflowId, 0, {
    agentId: agent.id,
    incidents: [],
    topicId,
  });
  if (!state) throw new Error('Failed to seed supervisor state');
  return state;
};

const failedOrchestrationWorkflow = async (
  enabled = true,
  error = 'fetch failed: ECONNRESET',
  seedSupervisor = true,
) => {
  const graph = await service().create({
    config: { supervision: { enabled } },
    tasks: ['Finish existing report'],
    title: 'Interrupted delivery',
  });
  if (seedSupervisor) await seedSupervisorAgent(graph.orchestrationWorkflow.id);
  const created = await service().tick(graph.orchestrationWorkflow.id);
  const taskId = created.taskId!;
  const topicId = `topic-failed-${++sequence}`;
  const operationId = `op-failed-${sequence}`;
  await db.insert(topics).values({ id: topicId, userId });
  await operationModel.recordStart({ operationId, taskId, topicId });
  await operationModel.recordCompletion(operationId, {
    completionReason: 'error',
    error: { message: error },
    status: 'error',
  });
  await db
    .insert(taskTopics)
    .values({ operationId, seq: 1, status: 'failed', taskId, topicId, userId });
  await taskModel.update(taskId, { status: 'failed', error, totalTopics: 1 });
  return {
    orchestrationWorkflowId: graph.orchestrationWorkflow.id,
    nodeId: created.nodeId!,
    operationId,
    taskId,
  };
};

/**
 * The run itself settled cleanly and something around it broke: the device link
 * dropped, or verification could not run. The Task is left `paused`, not `failed`,
 * and its operation is `done`, not `error`.
 */
const pipelineFailureOrchestrationWorkflow = async (
  error = '{"error":"DEVICE_OFFLINE","success":false}',
  withRun = true,
) => {
  const graph = await service().create({
    config: { supervision: { enabled: true } },
    tasks: ['Finish existing report'],
    title: 'Interrupted delivery',
  });
  if (withRun) await seedSupervisorAgent(graph.orchestrationWorkflow.id);
  const created = await service().tick(graph.orchestrationWorkflow.id);
  const taskId = created.taskId!;
  if (withRun) {
    const topicId = `topic-pipeline-${++sequence}`;
    const operationId = `op-pipeline-${sequence}`;
    await db.insert(topics).values({ id: topicId, userId });
    await operationModel.recordStart({ operationId, taskId, topicId });
    await operationModel.recordCompletion(operationId, {
      completionReason: 'done',
      status: 'done',
    });
    await db
      .insert(taskTopics)
      .values({ operationId, seq: 1, status: 'completed', taskId, topicId, userId });
  }
  await taskModel.update(taskId, { status: 'paused', error, totalTopics: withRun ? 1 : 0 });
  return { orchestrationWorkflowId: graph.orchestrationWorkflow.id, taskId };
};

const diagnose = async (orchestrationWorkflowId: string, action = 'retry') => {
  const state = (await orchestrationWorkflowModel.findById(orchestrationWorkflowId))!.config!
    .supervisorState!;
  const incident = state.incidents.at(-1)!;
  const tool = new OrchestrationWorkflowSupervisorTools({
    serverDB: db,
    userId,
    agentId: state.agentId,
    topicId: state.topicId,
    operationId: incident.supervisorOperationId,
    toolCallId: `resolve-${incident.id}`,
  });
  const scope = { orchestrationWorkflowId, incidentId: incident.id };
  await tool.inspectOrchestrationWorkflow(scope);
  await tool.inspectTask(scope);
  await tool.resolveInterruption({
    ...scope,
    action: action as 'retry' | 'escalate',
    instruction: 'Read existing checkpoint and only finish missing report delivery.',
    reason: 'The delivery upload failed after existing work was saved.',
  });
  await operationModel.recordCompletion(incident.supervisorOperationId!, {
    completionReason: 'done',
    status: 'done',
    totalCost: 0.1,
  });
  return incident;
};

describe('Orchestration workflow Supervisor integration', () => {
  it('creates the supervisor with the inherited saved runtime, then escalates per the held mount gate', async () => {
    const { orchestrationWorkflowId } = await failedOrchestrationWorkflow(
      true,
      'fetch failed: ECONNRESET',
      false,
    );
    expect((await service().tick(orchestrationWorkflowId)).outcome).toBe('waiting_human');
    const state = (await orchestrationWorkflowModel.findById(orchestrationWorkflowId))!.config!
      .supervisorState!;
    const [agent] = await db.select().from(agents).where(eq(agents.id, state.agentId));
    expect(agent).toMatchObject({
      agencyConfig: {
        boundDeviceId: 'supervisor-host',
        executionTarget: 'device',
        heterogeneousProvider: { type: 'orvilo', model: 'saved-supervisor-model' },
      },
      model: 'saved-supervisor-model',
      provider: 'openai',
      visibility: 'private',
    });
    // Held decision (handoff item 2): an orvilo-typed supervisor can never
    // mount the diagnostic tool surface — the incident escalates instead of
    // dispatching to execAgent.
    expect(state.incidents.at(-1)).toMatchObject({ status: 'escalated' });
    expect(AiAgentService.prototype.execAgent).not.toHaveBeenCalled();
  });

  it('rejects an unbound explicit orchestration workflow model before creating a supervisor', async () => {
    const { orchestrationWorkflowId, taskId, nodeId } = await failedOrchestrationWorkflow(
      true,
      'fetch failed: ECONNRESET',
      false,
    );
    await db.insert(userSettings).values({
      id: userId,
      systemAgent: { orchestrationWorkflow: { model: 'unauthorized-model', provider: 'openai' } },
    });
    const graph = await new OrchestrationWorkflowGraphModel(db, userId).getGraph(
      orchestrationWorkflowId,
    );
    const task = await taskModel.findById(taskId);
    const before = await db.select().from(agents);
    await expect(
      new OrchestrationWorkflowSupervisorService(db, userId).reviewFailure(graph!, nodeId, task!),
    ).rejects.toThrow('AGENT_RUNTIME_SETUP_REQUIRED');
    expect(await db.select().from(agents)).toHaveLength(before.length);
    expect(
      (await orchestrationWorkflowModel.findById(orchestrationWorkflowId))?.config?.supervisorState,
    ).toBeUndefined();
    expect(AiAgentService.prototype.execAgent).not.toHaveBeenCalled();
  });

  it('preserves the interrupted Orchestration workflow when no runtime is admitted', async () => {
    const { orchestrationWorkflowId, taskId, nodeId } = await failedOrchestrationWorkflow(
      true,
      'fetch failed: ECONNRESET',
      false,
    );
    await db.delete(providerBindings);
    const graph = await new OrchestrationWorkflowGraphModel(db, userId).getGraph(
      orchestrationWorkflowId,
    );
    const task = await taskModel.findById(taskId);
    const before = await db.select().from(agents);
    await expect(
      new OrchestrationWorkflowSupervisorService(db, userId).reviewFailure(graph!, nodeId, task!),
    ).rejects.toThrow('AGENT_RUNTIME_SETUP_REQUIRED');
    expect(await db.select().from(agents)).toHaveLength(before.length);
    expect(await orchestrationWorkflowModel.findById(orchestrationWorkflowId)).toBeDefined();
    expect(AiAgentService.prototype.execAgent).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    'requires confirmed supervisor cancellation before deletion: %s',
    async (confirmed) => {
      const { orchestrationWorkflowId } = await failedOrchestrationWorkflow();
      await service().tick(orchestrationWorkflowId);
      const state = (await orchestrationWorkflowModel.findById(orchestrationWorkflowId))!.config!
        .supervisorState!;
      const operationId = state.incidents[0].supervisorOperationId!;
      const interrupt = vi
        .spyOn(AiAgentService.prototype, 'interruptTask')
        .mockImplementation(async () => {
          expect((await orchestrationWorkflowModel.findById(orchestrationWorkflowId))!.status).toBe(
            'paused',
          );
          return { success: true, deviceCancellationConfirmed: confirmed };
        });
      if (confirmed) {
        await service().delete(orchestrationWorkflowId);
        expect(await orchestrationWorkflowModel.findById(orchestrationWorkflowId)).toBeUndefined();
      } else {
        await expect(service().delete(orchestrationWorkflowId)).rejects.toThrow(
          'exit was not confirmed',
        );
        expect(await orchestrationWorkflowModel.findById(orchestrationWorkflowId)).toBeDefined();
      }
      expect(interrupt).toHaveBeenCalledWith({ operationId, topicId: state.topicId });
    },
  );

  it('retains the Orchestration workflow when supervisor dispatch has no durable operation yet', async () => {
    const { orchestrationWorkflowId } = await failedOrchestrationWorkflow();
    vi.mocked(AiAgentService.prototype.execAgent).mockRejectedValueOnce(new Error('dispatch lost'));
    await service().tick(orchestrationWorkflowId);
    await expect(service().delete(orchestrationWorkflowId)).rejects.toThrow(
      'dispatch is unconfirmed',
    );
    expect(await orchestrationWorkflowModel.findById(orchestrationWorkflowId)).toBeDefined();
  });

  it('adopts a supervisor operation whose dispatch response was lost before deleting', async () => {
    const { orchestrationWorkflowId } = await failedOrchestrationWorkflow();
    const dispatch = vi.mocked(AiAgentService.prototype.execAgent).getMockImplementation()!;
    vi.mocked(AiAgentService.prototype.execAgent).mockImplementationOnce(async (params) => {
      await dispatch(params);
      throw new Error('response lost');
    });
    await service().tick(orchestrationWorkflowId);
    const interrupt = vi
      .spyOn(AiAgentService.prototype, 'interruptTask')
      .mockResolvedValue({ success: true });
    await service().delete(orchestrationWorkflowId);
    expect(interrupt).toHaveBeenCalledTimes(1);
    expect(await orchestrationWorkflowModel.findById(orchestrationWorkflowId)).toBeUndefined();
  });

  it('retains an Orchestration workflow resumed during supervisor cancellation', async () => {
    const { orchestrationWorkflowId } = await failedOrchestrationWorkflow();
    await service().tick(orchestrationWorkflowId);
    vi.spyOn(AiAgentService.prototype, 'interruptTask').mockImplementation(async () => {
      await orchestrationWorkflowModel.updateStatus(orchestrationWorkflowId, 'running');
      return { success: true };
    });
    await expect(service().delete(orchestrationWorkflowId)).rejects.toThrow(
      'changed during cancellation',
    );
    expect(await orchestrationWorkflowModel.findById(orchestrationWorkflowId)).toBeDefined();
  });

  it('requires scoped inspections, rejects unrelated callers, and records one idempotent action', async () => {
    const { orchestrationWorkflowId } = await failedOrchestrationWorkflow();
    await service().tick(orchestrationWorkflowId);
    const state = (await orchestrationWorkflowModel.findById(orchestrationWorkflowId))!.config!
      .supervisorState!;
    const incident = state.incidents[0];
    const context = {
      serverDB: db,
      userId,
      agentId: state.agentId,
      topicId: state.topicId,
      operationId: incident.supervisorOperationId,
      toolCallId: 'resolve-1',
    };
    const tool = new OrchestrationWorkflowSupervisorTools(context);
    const scope = { orchestrationWorkflowId, incidentId: incident.id };
    const request = {
      ...scope,
      action: 'retry' as const,
      instruction: 'Inspect and reuse the saved report.',
      reason: 'Delivery transport failed.',
    };
    expect((await tool.resolveInterruption(request)).success).toBe(false);
    for (const changed of [
      { topicId: 'other-topic' },
      { operationId: 'other-op' },
      { agentId: 'other-agent' },
      { userId: 'other-user' },
    ]) {
      expect(
        (
          await new OrchestrationWorkflowSupervisorTools({
            ...context,
            ...changed,
          }).inspectOrchestrationWorkflow(scope)
        ).success,
      ).toBe(false);
    }
    expect((await tool.inspectOrchestrationWorkflow(scope)).success).toBe(true);
    expect((await tool.inspectTask(scope)).success).toBe(true);
    expect((await tool.readArtifact({ ...scope, workVersionId: 'not-linked' })).success).toBe(
      false,
    );
    expect((await tool.resolveInterruption(request)).success).toBe(true);
    expect((await tool.resolveInterruption({ ...request, action: 'escalate' })).success).toBe(true);
    const current = (await orchestrationWorkflowModel.findById(orchestrationWorkflowId))!.config!
      .supervisorState!;
    expect(current.incidents[0].resolution).toMatchObject({
      action: 'retry',
      toolCallId: 'resolve-1',
    });
    expect(current.incidents[0].status).toBe('diagnosing');
    await service().pause(orchestrationWorkflowId);
    expect((await tool.inspectTask(scope)).success).toBe(false);
    expect((await tool.resolveInterruption(request)).success).toBe(false);
  });

  it('reads only linked accessible artifacts and labels mutable document text honestly', async () => {
    const { orchestrationWorkflowId, nodeId } = await failedOrchestrationWorkflow();
    const document = await new DocumentModel(db, userId).create({
      title: 'Checkpoint',
      content: 'saved result',
      fileType: 'text/plain',
      sourceType: 'api',
      source: 'test',
      totalCharCount: 12,
      totalLineCount: 1,
    });
    const work = await new WorkModel(db, userId).registerDocument({
      documentId: document.id,
      changeType: 'created',
      toolIdentifier: 'test',
      toolName: 'save',
    });
    await new OrchestrationWorkflowGraphModel(db, userId).attachWorkVersion(
      orchestrationWorkflowId,
      nodeId,
      work!.currentVersionId!,
      'input',
    );
    await service().tick(orchestrationWorkflowId);
    const state = (await orchestrationWorkflowModel.findById(orchestrationWorkflowId))!.config!
      .supervisorState!;
    const incident = state.incidents[0];
    const tool = new OrchestrationWorkflowSupervisorTools({
      serverDB: db,
      userId,
      agentId: state.agentId,
      topicId: state.topicId,
      operationId: incident.supervisorOperationId,
    });
    const result = await tool.readArtifact({
      orchestrationWorkflowId,
      incidentId: incident.id,
      workVersionId: work!.currentVersionId!,
    });
    expect(result.success).toBe(true);
    expect(JSON.parse(result.content)).toMatchObject({
      content: 'saved result',
      source: 'current_document_not_version_snapshot',
      truncated: false,
    });
    expect(
      (
        await tool.readArtifact({
          orchestrationWorkflowId,
          incidentId: incident.id,
          workVersionId: 'unrelated',
        })
      ).success,
    ).toBe(false);
  });

  it('persists a diagnostic topic, schedules its wake, retries once, and counts only consumed delivery', async () => {
    const { orchestrationWorkflowId, taskId } = await failedOrchestrationWorkflow();
    expect((await service().tick(orchestrationWorkflowId)).outcome).toBe('waiting_external');
    let graph = await service().graph(orchestrationWorkflowId);
    expect(graph.decisions).toHaveLength(0);
    expect(graph.orchestrationWorkflow.config?.supervisorState?.topicId).toBeTruthy();
    expect(scheduler.scheduleOrchestrationWorkflowAdvance).toHaveBeenCalled();
    expect(
      summarizeOrchestrationWorkflowSupervision(graph.orchestrationWorkflow.config?.supervisorState)
        .effectiveRecoveries,
    ).toBe(0);
    await diagnose(orchestrationWorkflowId);
    // A new service instance reads and resumes the persisted diagnosis.
    expect((await service().tick(orchestrationWorkflowId)).outcome).toBe('advanced');
    expect(await derivedStatus(taskId)).toBe('backlog');
    expect(AiAgentService.prototype.execAgent).toHaveBeenCalledTimes(1);
    const topicId = `topic-recovery-${++sequence}`;
    const operationId = `op-recovery-${sequence}`;
    vi.spyOn(TaskRunnerService.prototype, 'runTask').mockImplementation(async (params) => {
      expect(params.extraPrompt).toContain('existing checkpoint');
      await db.insert(topics).values({ id: topicId, userId });
      await db.insert(taskTopics).values({
        operationId,
        seq: 2,
        trigger: 'orchestrationWorkflow',
        status: 'running',
        taskId,
        topicId,
        userId,
      });
      return { ...runResult(operationId, topicId), taskId, taskIdentifier: 'T-1' };
    });
    await service().tick(orchestrationWorkflowId);
    graph = await service().graph(orchestrationWorkflowId);
    expect(graph.orchestrationWorkflow.config?.supervisorState?.incidents[0].status).toBe(
      'retrying',
    );
    expect(
      summarizeOrchestrationWorkflowSupervision(graph.orchestrationWorkflow.config?.supervisorState)
        .effectiveRecoveries,
    ).toBe(0);
    await taskModel.updateStatus(taskId, 'completed');
    await db.update(taskTopics).set({ status: 'completed' }).where(eq(taskTopics.topicId, topicId));
    await service().tick(orchestrationWorkflowId);
    graph = await service().graph(orchestrationWorkflowId);
    expect(
      summarizeOrchestrationWorkflowSupervision(
        graph.orchestrationWorkflow.config?.supervisorState,
      ),
    ).toMatchObject({
      effectiveRecoveries: 1,
      effectiveRecoveryRate: 1,
    });
    expect(graph.spend?.totalCost).toBe(0.1);
    await service().tick(orchestrationWorkflowId);
    expect(
      summarizeOrchestrationWorkflowSupervision(
        (await service().graph(orchestrationWorkflowId)).orchestrationWorkflow.config
          ?.supervisorState,
      ).effectiveRecoveries,
    ).toBe(1);
  });

  it('does not overwrite a pause that arrives during recovery application', async () => {
    const { orchestrationWorkflowId, taskId } = await failedOrchestrationWorkflow();
    await service().tick(orchestrationWorkflowId);
    await diagnose(orchestrationWorkflowId);
    const original = db.transaction.bind(db);
    let injected = false;
    vi.spyOn(db, 'transaction').mockImplementation(async (callback, config) => {
      if (!injected) {
        injected = true;
        await db
          .update(orchestrationWorkflows)
          .set({ status: 'paused' })
          .where(eq(orchestrationWorkflows.id, orchestrationWorkflowId));
      }
      return original(callback, config);
    });
    expect((await service().tick(orchestrationWorkflowId)).outcome).toBe('no_progress');
    expect((await orchestrationWorkflowModel.findById(orchestrationWorkflowId))?.status).toBe(
      'paused',
    );
    expect(await derivedStatus(taskId)).toBe('failed');
    expect((await service().graph(orchestrationWorkflowId)).decisions).toHaveLength(0);
  });

  it('settles the final failed recovery even when the incident ledger is full', async () => {
    const { orchestrationWorkflowId, taskId } = await failedOrchestrationWorkflow();
    await orchestrationWorkflowModel.update(orchestrationWorkflowId, {
      config: {
        ...(await orchestrationWorkflowModel.findById(orchestrationWorkflowId))!.config,
        supervision: { enabled: true, maxIncidents: 1 },
      },
    });
    await service().tick(orchestrationWorkflowId);
    await diagnose(orchestrationWorkflowId);
    await service().tick(orchestrationWorkflowId);
    const topicId = `topic-failed-again-${++sequence}`;
    const operationId = `op-failed-again-${sequence}`;
    await db.insert(topics).values({ id: topicId, userId });
    await operationModel.recordStart({ operationId, taskId, topicId });
    await operationModel.recordCompletion(operationId, {
      completionReason: 'error',
      error: { message: 'fetch failed' },
      status: 'error',
    });
    await db.insert(taskTopics).values({
      operationId,
      seq: 2,
      status: 'failed',
      taskId,
      topicId,
      trigger: 'orchestrationWorkflow',
      userId,
    });
    await taskModel.update(taskId, { status: 'failed', error: 'fetch failed', totalTopics: 2 });
    expect((await service().tick(orchestrationWorkflowId)).outcome).toBe('waiting_human');
    expect(
      (await orchestrationWorkflowModel.findById(orchestrationWorkflowId))?.config?.supervisorState
        ?.incidents[0].status,
    ).toBe('unsuccessful');
  });

  it('a newer cancelled recovery cannot take credit for the earlier delivery', async () => {
    const { orchestrationWorkflowId, taskId, operationId } = await failedOrchestrationWorkflow();
    await service().tick(orchestrationWorkflowId);
    await diagnose(orchestrationWorkflowId);
    await service().tick(orchestrationWorkflowId);
    const graph = await service().graph(orchestrationWorkflowId);
    const cancelledTopicId = `topic-cancelled-${++sequence}`;
    const cancelledOperationId = `op-cancelled-${sequence}`;
    await db.insert(topics).values({ id: cancelledTopicId, userId });
    await db.insert(taskTopics).values({
      operationId: cancelledOperationId,
      seq: 2,
      status: 'canceled',
      taskId,
      topicId: cancelledTopicId,
      trigger: 'orchestrationWorkflow',
      userId,
    });
    await new OrchestrationWorkflowSupervisorService(db, userId).recordDispatch(
      graph,
      taskId,
      cancelledOperationId,
    );
    await db
      .update(taskTopics)
      .set({ status: 'completed' })
      .where(eq(taskTopics.operationId, operationId));
    await taskModel.update(taskId, { status: 'completed', totalTopics: 2 });
    expect((await service().tick(orchestrationWorkflowId)).outcome).toBe('advanced');
    expect(
      summarizeOrchestrationWorkflowSupervision(
        (await service().graph(orchestrationWorkflowId)).orchestrationWorkflow.config
          ?.supervisorState,
      ).effectiveRecoveries,
    ).toBe(0);
  });

  it('adopts a orchestration-workflow-triggered accepted recovery after losing the dispatch receipt', async () => {
    const { orchestrationWorkflowId, taskId } = await failedOrchestrationWorkflow();
    await service().tick(orchestrationWorkflowId);
    await diagnose(orchestrationWorkflowId);
    await service().tick(orchestrationWorkflowId);
    const topicId = `topic-adopt-${++sequence}`;
    const operationId = `op-adopt-${sequence}`;
    await db.insert(topics).values({ id: topicId, userId });
    await db.insert(taskTopics).values({
      operationId,
      seq: 2,
      status: 'completed',
      taskId,
      topicId,
      trigger: 'orchestrationWorkflow',
      userId,
    });
    await taskModel.updateStatus(taskId, 'completed');
    await service().tick(orchestrationWorkflowId);
    expect(
      (await orchestrationWorkflowModel.findById(orchestrationWorkflowId))?.config?.supervisorState
        ?.incidents[0],
    ).toMatchObject({ recoveryOperationId: operationId, status: 'recovered' });
  });

  it('recovers a paused pipeline failure instead of leaving it on the human Gate', async () => {
    const { orchestrationWorkflowId, taskId } = await pipelineFailureOrchestrationWorkflow();
    expect((await service().tick(orchestrationWorkflowId)).outcome).toBe('waiting_external');
    expect((await service().graph(orchestrationWorkflowId)).decisions).toHaveLength(0);
    await diagnose(orchestrationWorkflowId);
    expect((await service().tick(orchestrationWorkflowId)).outcome).toBe('advanced');
    // The Task holds `paused`, so a recovery that only accepted `failed` would
    // silently do nothing here and escalate the incident.
    expect(await derivedStatus(taskId)).toBe('backlog');
    const graph = await service().graph(orchestrationWorkflowId);
    expect(graph.orchestrationWorkflow.config?.supervisorState?.incidents.at(-1)?.status).not.toBe(
      'escalated',
    );
  });

  it('does not overwrite a completion a person recorded during the diagnosis', async () => {
    const { orchestrationWorkflowId, taskId } = await pipelineFailureOrchestrationWorkflow();
    expect((await service().tick(orchestrationWorkflowId)).outcome).toBe('waiting_external');
    await diagnose(orchestrationWorkflowId);
    // The person settled the Task while the supervisor was still deciding.
    await taskModel.update(taskId, { status: 'completed', error: null });
    await service().tick(orchestrationWorkflowId);
    expect(await derivedStatus(taskId)).toBe('completed');
  });

  it('loses the claim when the Task moved to another recoverable state mid-diagnosis', async () => {
    // Routed as `paused`; a person then marks it `failed` without supplying a new
    // error, so the run's transport reason survives and the policy still accepts it.
    // Only claiming against the status the incident was opened on keeps this decision.
    const { orchestrationWorkflowId, taskId } = await failedOrchestrationWorkflow(
      true,
      '{"error":"DEVICE_OFFLINE","success":false}',
    );
    await taskModel.update(taskId, { status: 'paused' });
    expect((await service().tick(orchestrationWorkflowId)).outcome).toBe('waiting_external');
    await diagnose(orchestrationWorkflowId);
    await taskModel.update(taskId, { status: 'failed' });
    await service().tick(orchestrationWorkflowId);
    expect(await derivedStatus(taskId)).toBe('failed');
  });

  it('escalates a diagnosis persisted before the opening status was recorded', async () => {
    const { orchestrationWorkflowId, taskId } = await pipelineFailureOrchestrationWorkflow();
    expect((await service().tick(orchestrationWorkflowId)).outcome).toBe('waiting_external');
    await diagnose(orchestrationWorkflowId);
    // A rolling deploy leaves incidents from the previous version with no record of
    // what they opened on, so they cannot prove the row is still theirs to claim.
    const state = (await orchestrationWorkflowModel.findById(orchestrationWorkflowId))!.config!
      .supervisorState!;
    await orchestrationWorkflowModel.updateSupervisorState(
      orchestrationWorkflowId,
      state.revision,
      {
        ...state,
        incidents: state.incidents.map(({ taskStatus: _drop, ...rest }) => rest),
      },
    );
    expect(
      (await orchestrationWorkflowModel.findById(
        orchestrationWorkflowId,
      ))!.config!.supervisorState!.incidents.at(-1)?.taskStatus,
    ).toBeUndefined();

    await service().tick(orchestrationWorkflowId);

    expect(await derivedStatus(taskId)).toBe('paused');
    const after = (await orchestrationWorkflowModel.findById(orchestrationWorkflowId))!.config!
      .supervisorState!;
    expect(after.incidents.at(-1)?.status).toBe('escalated');
  });

  it('leaves a paused transport failure alone once a person marks it failed', async () => {
    // The run errored with a recoverable transport error and the lifecycle paused the
    // Task. A person then marks it failed without supplying a new error, so the
    // transport text survives and only the transition's author tells them apart.
    const { orchestrationWorkflowId, taskId } = await failedOrchestrationWorkflow();
    await taskModel.update(taskId, { status: 'paused' });
    await new TaskService(db, userId).updateStatus({ id: taskId, status: 'failed' }, { userId });

    const move = await service().tick(orchestrationWorkflowId);

    expect(await derivedStatus(taskId)).toBe('failed');
    expect(move.outcome).not.toBe('waiting_external');
  });

  it('without supervision the same transport failure opens a human Gate', async () => {
    const { orchestrationWorkflowId } = await failedOrchestrationWorkflow(false);
    expect((await service().tick(orchestrationWorkflowId)).outcome).toBe('waiting_human');
    expect((await service().graph(orchestrationWorkflowId)).decisions[0].authority).toBe('user');
    expect(AiAgentService.prototype.execAgent).not.toHaveBeenCalled();
  });

  it('does not diagnose or recover an authentication failure', async () => {
    const { orchestrationWorkflowId } = await failedOrchestrationWorkflow(
      true,
      'InvalidProviderAPIKey',
    );
    expect((await service().tick(orchestrationWorkflowId)).outcome).toBe('waiting_human');
    expect(AiAgentService.prototype.execAgent).not.toHaveBeenCalled();
    expect(
      summarizeOrchestrationWorkflowSupervision(
        (await service().graph(orchestrationWorkflowId)).orchestrationWorkflow.config
          ?.supervisorState,
      ),
    ).toMatchObject({ eligibleInterruptions: 0, escalated: 1 });
  });

  it('respects a user pause arriving while the diagnosis runs', async () => {
    const { orchestrationWorkflowId, taskId } = await failedOrchestrationWorkflow();
    await service().tick(orchestrationWorkflowId);
    await service().pause(orchestrationWorkflowId);
    await diagnose(orchestrationWorkflowId);
    expect((await service().tick(orchestrationWorkflowId)).outcome).toBe('no_progress');
    expect(await derivedStatus(taskId)).toBe('failed');
  });

  it('respects a manual Gate opened while diagnosis runs', async () => {
    const { orchestrationWorkflowId, taskId } = await failedOrchestrationWorkflow();
    await service().tick(orchestrationWorkflowId);
    const graphModel = new OrchestrationWorkflowGraphModel(db, userId);
    const node = await graphModel.createNode(orchestrationWorkflowId, {
      kind: 'decision',
      title: 'Approve publication',
    });
    await graphModel.createDecision(orchestrationWorkflowId, node!.id, {
      authority: 'user',
      question: 'Publish externally?',
    });
    await diagnose(orchestrationWorkflowId);
    expect((await service().tick(orchestrationWorkflowId)).outcome).toBe('waiting_human');
    expect(await derivedStatus(taskId)).toBe('failed');
  });

  it('excludes budget-blocked interruptions from the eligible recovery denominator', async () => {
    const { orchestrationWorkflowId, taskId } = await failedOrchestrationWorkflow();
    await orchestrationWorkflowModel.update(orchestrationWorkflowId, { maxRounds: 1 });
    expect((await service().tick(orchestrationWorkflowId)).outcome).toBe('waiting_human');
    const graph = await service().graph(orchestrationWorkflowId);
    expect(
      summarizeOrchestrationWorkflowSupervision(
        graph.orchestrationWorkflow.config?.supervisorState,
      ),
    ).toMatchObject({
      eligibleInterruptions: 0,
      effectiveRecoveryRate: null,
      escalated: 1,
    });
    expect(AiAgentService.prototype.execAgent).not.toHaveBeenCalled();
    expect(await derivedStatus(taskId)).toBe('failed');
  });

  it('checks the budget again after paying for the diagnosis', async () => {
    const { orchestrationWorkflowId, taskId } = await failedOrchestrationWorkflow();
    await orchestrationWorkflowModel.update(orchestrationWorkflowId, { maxTotalCost: 0.05 });
    await service().tick(orchestrationWorkflowId);
    await diagnose(orchestrationWorkflowId);
    expect((await service().tick(orchestrationWorkflowId)).outcome).toBe('waiting_human');
    expect(await derivedStatus(taskId)).toBe('failed');
  });

  it('adopts an operation after the dispatch response was lost', async () => {
    const { orchestrationWorkflowId } = await failedOrchestrationWorkflow();
    const realMock = vi.mocked(AiAgentService.prototype.execAgent).getMockImplementation()!;
    vi.mocked(AiAgentService.prototype.execAgent).mockImplementationOnce(async (params) => {
      await realMock(params);
      throw new Error('lost response');
    });
    await service().tick(orchestrationWorkflowId);
    expect(
      (await orchestrationWorkflowModel.findById(orchestrationWorkflowId))!.config!.supervisorState!
        .incidents[0].supervisorOperationId,
    ).toBeUndefined();
    const state = (await orchestrationWorkflowModel.findById(orchestrationWorkflowId))!.config!
      .supervisorState!;
    await operationModel.recordStart({
      operationId: 'unrelated-supervisor-turn',
      topicId: state.topicId,
      appContext: { sourceMessageId: 'unrelated-user-message' },
    });
    await service().tick(orchestrationWorkflowId);
    const adopted = (await orchestrationWorkflowModel.findById(orchestrationWorkflowId))!.config!
      .supervisorState!.incidents[0].supervisorOperationId;
    expect(adopted).toBeTruthy();
    expect(adopted).not.toBe('unrelated-supervisor-turn');
    expect(AiAgentService.prototype.execAgent).toHaveBeenCalledTimes(1);
  });

  it('does not count a manually resumed or unrelated delivery', async () => {
    const { orchestrationWorkflowId, taskId } = await failedOrchestrationWorkflow();
    await service().tick(orchestrationWorkflowId);
    await diagnose(orchestrationWorkflowId);
    await service().tick(orchestrationWorkflowId);
    const graph = await service().graph(orchestrationWorkflowId);
    await new OrchestrationWorkflowSupervisorService(db, userId).recordProgress(
      graph,
      taskId,
      true,
    );
    await taskModel.updateStatus(taskId, 'completed');
    await service().tick(orchestrationWorkflowId);
    expect(
      summarizeOrchestrationWorkflowSupervision(
        (await service().graph(orchestrationWorkflowId)).orchestrationWorkflow.config
          ?.supervisorState,
      ).effectiveRecoveries,
    ).toBe(0);
  });
});
