import type { OrchestrationWorkflowItem } from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';

import { AgentModel } from '@/database/models/agent';
import { OrchestrationWorkflowModel } from '@/database/models/orchestrationWorkflow';
import {
  orchestrationWorkflowNodeDecisions,
  orchestrationWorkflowNodes,
} from '@/database/schemas/orchestrationWorkflowGraph';
import { tasks } from '@/database/schemas/task';
import type { OrviloDatabase } from '@/database/type';
import { isCaidDispatchAllowed } from '@/server/featureFlags/caidAdmission';
import { getScopedOnlineDevices } from '@/server/services/deviceGateway/scopedDevices';

export type OrchestrationWorkflowWaitingReason =
  | 'plan_not_confirmed'
  | 'decision_pending'
  | 'dispatch_not_admitted'
  | 'device_offline'
  | 'planning'
  | 'paused'
  | null;

export const orchestrationWorkflowWaitingReason = (
  orchestrationWorkflow: Pick<OrchestrationWorkflowItem, 'config' | 'status'>,
  input: { decisionPending: boolean; dispatchAllowed: boolean; deviceOnline: boolean },
): OrchestrationWorkflowWaitingReason => {
  if (['achieved', 'failed', 'canceled'].includes(orchestrationWorkflow.status)) return null;
  if (!orchestrationWorkflow.config?.planConfirmedAt) return 'plan_not_confirmed';
  if (input.decisionPending) return 'decision_pending';
  if (orchestrationWorkflow.status === 'paused') return 'paused';
  if (!input.dispatchAllowed) return 'dispatch_not_admitted';
  if (!input.deviceOnline) return 'device_offline';
  return orchestrationWorkflow.status === 'planning' ? 'planning' : null;
};

/** Card reads query only their own rows; no graph, artifacts or trace hydration. */
export class OrchestrationWorkflowConversationService {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  private requireOrchestrationWorkflow = async (id: string) => {
    const item = await new OrchestrationWorkflowModel(
      this.db,
      this.userId,
      this.workspaceId,
    ).findById(id);
    if (!item)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Orchestration workflow not found' });
    return item;
  };

  listDecisions = async (id: string) => {
    await this.requireOrchestrationWorkflow(id);
    return this.db
      .select({ decision: orchestrationWorkflowNodeDecisions })
      .from(orchestrationWorkflowNodeDecisions)
      .innerJoin(
        orchestrationWorkflowNodes,
        eq(orchestrationWorkflowNodes.id, orchestrationWorkflowNodeDecisions.nodeId),
      )
      .where(
        and(
          eq(orchestrationWorkflowNodes.orchestrationWorkflowId, id),
          eq(orchestrationWorkflowNodeDecisions.status, 'pending'),
        ),
      )
      .then((rows) => rows.map(({ decision }) => decision));
  };

  listIssues = async (id: string) => {
    await this.requireOrchestrationWorkflow(id);
    return this.db
      .select({
        id: tasks.id,
        identifier: tasks.identifier,
        title: tasks.name,
        status: tasks.workflowCategory,
        workflowCategory: tasks.workflowCategory,
        workflowStateId: tasks.workflowStateId,
        workflowStateRefId: tasks.workflowStateRefId,
      })
      .from(orchestrationWorkflowNodes)
      .innerJoin(tasks, eq(tasks.id, orchestrationWorkflowNodes.taskId))
      .where(eq(orchestrationWorkflowNodes.orchestrationWorkflowId, id));
  };

  getStatus = async (id: string) => {
    const item = await this.requireOrchestrationWorkflow(id);
    const [decisions, dispatchAllowed, agent, devices] = await Promise.all([
      this.listDecisions(id),
      isCaidDispatchAllowed({ userId: this.userId, workspaceId: this.workspaceId }),
      item.agentId
        ? new AgentModel(this.db, this.userId, this.workspaceId).getAgentConfig(item.agentId)
        : undefined,
      getScopedOnlineDevices(this.db, this.userId, this.workspaceId),
    ]);
    const boundDeviceId = agent?.agencyConfig?.boundDeviceId;
    const deviceOnline = devices.some(
      (device) => device.online && (!boundDeviceId || device.deviceId === boundDeviceId),
    );
    return {
      id: item.id,
      agentId: item.agentId,
      projectId: item.projectId,
      status: item.status,
      planConfirmedAt: item.config?.planConfirmedAt ?? null,
      waitingReason: orchestrationWorkflowWaitingReason(item, {
        decisionPending: decisions.length > 0,
        dispatchAllowed,
        deviceOnline,
      }),
      orchestrationAdmission: dispatchAllowed ? ('enabled' as const) : ('disabled' as const),
      orchestrationAdmissionReason: dispatchAllowed ? null : ('caid_dispatch_disabled' as const),
      openDecisionCount: decisions.length,
    };
  };
}
