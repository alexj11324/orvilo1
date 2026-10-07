import type { ChatToolPayload } from '@orvilo/types';
import { isRecord } from '@orvilo/utils/object';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { pick } from 'es-toolkit';

import { agents, tasks, taskTopics, topics, workspaceMembers } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import type {
  OperationStatusResult,
  PendingInterventionsResult,
} from '@/server/services/agentExecution/types';

import { redactAgentConfig } from './resourceConfigGuard';

/** Issue View follows active workspace membership, independent of legacy visibility and Agent Use. */
export const isWorkspaceIssueAgentReadable = async (
  db: OrviloDatabase,
  agentId: string,
  userId: string,
  workspaceId: string,
): Promise<boolean> => {
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .innerJoin(agents, eq(agents.id, agentId))
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, tasks.workspaceId))
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(agents.workspaceId, workspaceId),
        eq(agents.id, agentId),
        or(
          eq(tasks.assigneeAgentId, agentId),
          sql`exists (select 1 from ${taskTopics} issue_run
            inner join ${topics} issue_topic on issue_topic.id = issue_run.topic_id
            where issue_run.task_id = ${tasks.id}
              and issue_run.workspace_id = ${workspaceId}
              and issue_topic.workspace_id = ${workspaceId}
              and issue_topic.agent_id = ${agentId} and issue_topic.sender_id is null)`,
        ),
        eq(workspaceMembers.userId, userId),
        isNull(workspaceMembers.deletedAt),
        isNull(workspaceMembers.suspendedAt),
        sql`${tasks.isDeleted} IS NOT TRUE`,
      ),
    )
    .limit(1);
  return rows.length > 0;
};

export const readableWorkspaceIssueTopicIds = async (
  db: OrviloDatabase,
  topicIds: string[],
  userId: string,
  workspaceId: string,
): Promise<Set<string>> => {
  if (topicIds.length === 0) return new Set();
  const rows = await db
    .select({ topicId: taskTopics.topicId })
    .from(taskTopics)
    .innerJoin(tasks, eq(tasks.id, taskTopics.taskId))
    .innerJoin(topics, eq(topics.id, taskTopics.topicId))
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, tasks.workspaceId))
    .where(
      and(
        inArray(taskTopics.topicId, topicIds),
        eq(tasks.workspaceId, workspaceId),
        eq(taskTopics.workspaceId, workspaceId),
        eq(topics.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
        isNull(workspaceMembers.deletedAt),
        isNull(workspaceMembers.suspendedAt),
        isNull(topics.senderId),
        sql`${tasks.isDeleted} IS NOT TRUE`,
      ),
    );
  return new Set(rows.flatMap(({ topicId }) => (topicId ? [topicId] : [])));
};

/** A referenced private Agent contributes display identity, never its executable configuration. */
export const getWorkspaceIssueAgentProfile = async (
  db: OrviloDatabase,
  agentId: string,
  userId: string,
  workspaceId?: string | null,
) => {
  if (!workspaceId || !(await isWorkspaceIssueAgentReadable(db, agentId, userId, workspaceId)))
    return null;
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
    .limit(1);
  if (!agent) return null;
  const profile = redactAgentConfig(agent);
  return {
    ...pick(profile, [
      'createdAt',
      'description',
      'id',
      'marketIdentifier',
      'slug',
      'updatedAt',
      'userId',
      'visibility',
      'workspaceId',
    ]),
    agencyConfig: profile.agencyConfig ?? undefined,
    avatar: profile.avatar ?? undefined,
    backgroundColor: profile.backgroundColor ?? undefined,
    chatConfig: profile.chatConfig ?? undefined,
    model: profile.model ?? undefined,
    name: profile.name ?? undefined,
    openingMessage: profile.openingMessage ?? undefined,
    openingQuestions: profile.openingQuestions ?? undefined,
    provider: profile.provider ?? undefined,
    title: profile.title ?? undefined,
    virtual: profile.virtual ?? undefined,
  };
};

const projectIssueQuestions = (source: {
  pendingHumanPrompt?: Record<string, unknown>;
  pendingHumanSelect?: Record<string, unknown>;
  pendingToolsCalling?: ChatToolPayload[];
}) => ({
  ...(source.pendingHumanPrompt
    ? {
        pendingHumanPrompt: pick(source.pendingHumanPrompt, [
          'apiName',
          'identifier',
          'prompt',
          'questions',
          'options',
          'fields',
          'answerPolicy',
          'customDetail',
        ]),
      }
    : {}),
  ...(source.pendingHumanSelect
    ? {
        pendingHumanSelect: pick(source.pendingHumanSelect, ['prompt', 'options', 'multi']),
      }
    : {}),
  ...(source.pendingToolsCalling
    ? {
        pendingToolsCalling: source.pendingToolsCalling.map((tool) =>
          pick(tool, ['id', 'apiName', 'identifier', 'type']),
        ),
      }
    : {}),
});

/** An operation owner keeps their own run data, but Agent Use does not expose executable metadata. */
export const projectWorkspaceUseOperationStatus = (
  status: OperationStatusResult | null,
): OperationStatusResult | null => {
  if (!status) return null;
  return {
    ...status,
    metadata: {
      ...(isRecord(status.metadata?.agentConfig)
        ? { agentConfig: redactAgentConfig(status.metadata.agentConfig) }
        : {}),
    },
  };
};

export const projectWorkspaceUsePendingIntervention = (
  entry: PendingInterventionsResult['pendingInterventions'][number],
): PendingInterventionsResult['pendingInterventions'][number] => {
  const { modelRuntimeConfig: _modelRuntimeConfig, ...safeEntry } = entry;
  return safeEntry;
};

/** Keep observable status/questions; runtime credentials, raw state history and events remain owner-only. */
export const projectWorkspaceIssueOperationStatus = (
  status: OperationStatusResult | null,
): OperationStatusResult | null => {
  if (!status) return null;
  return {
    ...pick(status, ['operationId', 'hasError', 'isActive', 'isCompleted', 'needsHumanInput']),
    currentState: {
      ...pick(status.currentState, ['status', 'stepCount', 'lastModified', 'maxSteps']),
      ...projectIssueQuestions(status.currentState),
    },
    metadata: {
      ...(isRecord(status.metadata?.agentConfig)
        ? { agentConfig: redactAgentConfig(status.metadata.agentConfig) }
        : {}),
    },
    stats: pick(status.stats, [
      'lastActiveTime',
      'totalCost',
      'totalMessages',
      'totalSteps',
      'uptime',
    ]),
  };
};

export const projectWorkspaceIssuePendingInterventions = (
  result: PendingInterventionsResult,
): PendingInterventionsResult => ({
  totalCount: result.totalCount,
  timestamp: result.timestamp,
  pendingInterventions: result.pendingInterventions.map((entry) => ({
    ...pick(entry, ['operationId', 'lastModified', 'status', 'stepCount', 'type', 'userId']),
    ...projectIssueQuestions(entry),
  })),
});
