import { isRecord } from '@orvilo/utils/object';
import { and, eq, sql } from 'drizzle-orm';

import { agentsToSessions, topics } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';

import { getResourceConfigAccess } from './resourceConfigGuard';

// These are runtime control data, not the conversation or its tool outputs.
const INTERNAL_METADATA_KEYS = new Set([
  'workingDirectory',
  'workingDirectoryConfig',
  'heteroSessionId',
  'heteroMessageId',
  'heteroSessionIdByWorkingDirectory',
  'heteroSessionBindingKey',
  'heteroSessionBindingKeyByWorkingDirectory',
  'executionConfig',
  'boundDeviceId',
  'bindingRevision',
]);

interface ProjectionContext {
  db: OrviloDatabase;
  userId: string;
  workspaceId?: string | null;
}
interface ConversationReference {
  agentId?: string;
  groupId?: string;
  topicId?: string;
}

/** Project only the two workspace conversation DTOs; stored runtime data remains intact. */
export const projectWorkspaceConversationMetadata = async <T extends object>(
  ctx: ProjectionContext,
  rows: T[],
  fallbackTopicId?: string | null | ((row: T) => string | null | undefined),
): Promise<T[]> => {
  if (!ctx.workspaceId) return rows;
  const workspaceId = ctx.workspaceId;
  const access = new Map<string, Promise<boolean>>();
  const topicReferences = new Map<string, Promise<ConversationReference[]>>();
  const canReadConfig = async (ref: ConversationReference): Promise<boolean> => {
    const { agentId, groupId } = ref;
    if (!agentId && !groupId && ref.topicId) {
      let topic = topicReferences.get(ref.topicId);
      if (!topic) {
        topic = ctx.db
          .select({
            agentId: sql<string | null>`coalesce(${topics.agentId}, ${agentsToSessions.agentId})`,
            groupId: topics.groupId,
          })
          .from(topics)
          .leftJoin(agentsToSessions, eq(agentsToSessions.sessionId, topics.sessionId))
          .where(and(eq(topics.id, ref.topicId), eq(topics.workspaceId, workspaceId)))
          .then((rows) =>
            rows.map((row) => ({
              agentId: row.agentId ?? undefined,
              groupId: row.groupId ?? undefined,
            })),
          );
        topicReferences.set(ref.topicId, topic);
      }
      const references = await topic;
      return (
        references.length > 0 && (await Promise.all(references.map(canReadConfig))).every(Boolean)
      );
    }
    const resourceId = agentId || groupId;
    if (!resourceId) return false;
    const resourceType = agentId ? 'agent' : 'agentGroup';
    const key = resourceType + ':' + resourceId;
    let allowed = access.get(key);
    if (!allowed) {
      allowed = getResourceConfigAccess(ctx, resourceType, resourceId).then(
        (level) => level === 'full',
      );
      access.set(key, allowed);
    }
    return allowed;
  };

  const projectNode = async (
    node: Record<string, unknown>,
    inherited: ConversationReference,
  ): Promise<Record<string, unknown>> => {
    const changedTopic = typeof node.topicId === 'string' && node.topicId !== inherited.topicId;
    const ref = {
      agentId:
        typeof node.agentId === 'string'
          ? node.agentId
          : changedTopic
            ? undefined
            : inherited.agentId,
      groupId:
        typeof node.groupId === 'string'
          ? node.groupId
          : changedTopic
            ? undefined
            : inherited.groupId,
      topicId: typeof node.topicId === 'string' ? node.topicId : inherited.topicId,
    };
    const result = { ...node };
    if (
      isRecord(node.metadata) &&
      Object.keys(node.metadata).some((key) => INTERNAL_METADATA_KEYS.has(key)) &&
      !(await canReadConfig(ref))
    ) {
      result.metadata = Object.fromEntries(
        Object.entries(node.metadata).filter(([key]) => !INTERNAL_METADATA_KEYS.has(key)),
      );
    }
    // Follow generated message groups only. Plugin state and tool results are conversation content.
    for (const field of [
      'children',
      'members',
      'tasks',
      'compressedMessages',
      'taskCompletions',
      'council',
    ]) {
      const children = node[field];
      if (Array.isArray(children))
        result[field] = await Promise.all(
          children.map((child) => (isRecord(child) ? projectNode(child, ref) : child)),
        );
    }
    if (Array.isArray(node.columns))
      result.columns = await Promise.all(
        node.columns.map((column) =>
          Array.isArray(column)
            ? Promise.all(
                column.map((child) => (isRecord(child) ? projectNode(child, ref) : child)),
              )
            : column,
        ),
      );
    return result;
  };
  return Promise.all(
    rows.map((row) =>
      projectNode(row as Record<string, unknown>, {
        topicId:
          (typeof fallbackTopicId === 'function' ? fallbackTopicId(row) : fallbackTopicId) ??
          undefined,
      }),
    ),
  ) as Promise<T[]>;
};
