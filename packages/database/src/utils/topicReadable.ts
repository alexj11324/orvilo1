import {
  and,
  eq,
  exists,
  isNull,
  notExists,
  or,
  type SQL,
  sql,
  type SQLWrapper,
} from 'drizzle-orm';

import {
  chatGroups,
  documents,
  messages,
  projects,
  tasks,
  taskTopics,
  topicDocuments,
  topics,
} from '../schemas';
import type { OrviloDatabase } from '../type';
import { buildDocumentReadableWhere } from './documentAccess';
import { buildProjectReadableWhere } from './projectReadable';
import { buildTaskReadableWhere } from './taskTeamReadable';
import { buildWorkspaceWhere } from './workspace';

/** Agent access never grants access to another member's standalone conversation. */
export const buildTopicReadableWhere = (
  db: OrviloDatabase,
  ctx: { userId: string; workspaceId?: string },
): SQL => {
  const scope = buildWorkspaceWhere(ctx, topics);
  if (!ctx.workspaceId) return scope;
  const issueLink = and(
    eq(taskTopics.topicId, topics.id),
    eq(taskTopics.workspaceId, topics.workspaceId),
    eq(tasks.workspaceId, topics.workspaceId),
    sql`${tasks.isDeleted} IS NOT TRUE`,
  );
  const readableIssue = buildTaskReadableWhere(db, ctx);
  return and(
    scope,
    or(
      isNull(topics.projectId),
      exists(
        db
          .select({ one: sql`1` })
          .from(projects)
          .where(and(eq(projects.id, topics.projectId), buildProjectReadableWhere(db, ctx))),
      ),
    ),
    // A private Project remains the ceiling even for the topic creator.
    notExists(
      db
        .select({ one: sql`1` })
        .from(taskTopics)
        .innerJoin(tasks, eq(tasks.id, taskTopics.taskId))
        .where(and(issueLink, sql`NOT (${readableIssue})`)),
    ),
    or(
      eq(topics.userId, ctx.userId),
      exists(
        db
          .select({ one: sql`1` })
          .from(taskTopics)
          .innerJoin(tasks, eq(tasks.id, taskTopics.taskId))
          .where(and(issueLink, readableIssue)),
      ),
      exists(
        db
          .select({ one: sql`1` })
          .from(chatGroups)
          .where(and(eq(chatGroups.id, topics.groupId), buildWorkspaceWhere(ctx, chatGroups))),
      ),
      and(
        eq(topics.trigger, 'document'),
        exists(
          db
            .select({ one: sql`1` })
            .from(topicDocuments)
            .innerJoin(documents, eq(documents.id, topicDocuments.documentId))
            .where(and(eq(topicDocuments.topicId, topics.id), buildDocumentReadableWhere(db, ctx))),
        ),
      ),
    ),
  )!;
};

/** Transcript rows inherit topic access; legacy topicless group chat keeps its group ACL. */
export const buildMessageReadableWhere = (
  db: OrviloDatabase,
  ctx: { userId: string; workspaceId?: string },
  target: { groupId: SQLWrapper; topicId: SQLWrapper; userId: SQLWrapper } = messages,
): SQL =>
  or(
    and(
      isNull(target.topicId),
      or(
        eq(target.userId, ctx.userId),
        exists(
          db
            .select({ one: sql`1` })
            .from(chatGroups)
            .where(and(eq(chatGroups.id, target.groupId), buildWorkspaceWhere(ctx, chatGroups))),
        ),
      ),
    ),
    exists(
      db
        .select({ one: sql`1` })
        .from(topics)
        .where(and(eq(topics.id, target.topicId), buildTopicReadableWhere(db, ctx))),
    ),
  )!;
