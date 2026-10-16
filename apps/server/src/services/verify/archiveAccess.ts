import { eq } from 'drizzle-orm';

import { DocumentModel } from '@/database/models/document';
import { GoalModel } from '@/database/models/goal';
import { ProjectModel } from '@/database/models/project';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { TopicModel } from '@/database/models/topic';
import { WorkspaceMemberModel } from '@/database/models/workspaceMember';
import { acceptances, agentOperations } from '@/database/schemas';
import type { AcceptanceItem, VerifyRunItem } from '@/database/schemas/verify';
import type { OrviloDatabase } from '@/database/type';

interface ArchiveReader {
  serverDB: OrviloDatabase;
  userId?: string | null;
}

const canReadIssue = async (ctx: ArchiveReader, taskId: string, workspaceId?: string | null) => {
  if (!ctx.userId) return false;
  const task = await new TaskModel(ctx.serverDB, ctx.userId, workspaceId ?? undefined).findById(
    taskId,
  );
  if (!task) return false;
  return (
    !task.projectId ||
    Boolean(
      await new ProjectModel(ctx.serverDB, ctx.userId, workspaceId ?? undefined).findById(
        task.projectId,
      ),
    )
  );
};

export const canReadArchiveTopic = async (
  ctx: ArchiveReader,
  topicId: string,
  workspaceId?: string | null,
) => {
  if (!ctx.userId) return false;
  const topic = await new TopicModel(ctx.serverDB, ctx.userId, workspaceId ?? undefined).findById(
    topicId,
  );
  if (!topic) return false;
  if (
    topic.projectId &&
    !(await new ProjectModel(ctx.serverDB, ctx.userId, workspaceId ?? undefined).findById(
      topic.projectId,
    ))
  )
    return false;
  const taskTopic = await new TaskTopicModel(
    ctx.serverDB,
    ctx.userId,
    workspaceId ?? undefined,
  ).findByTopicId(topicId);
  return !taskTopic || canReadIssue(ctx, taskTopic.taskId, workspaceId);
};

/** Ledger visibility cannot widen its Issue/Project/Topic/Document visibility ceiling. */
export const canReadAcceptanceArchive = async (
  ctx: ArchiveReader,
  // Goal is a historical read-only subject, never a new Acceptance writer input.
  acceptance: Omit<AcceptanceItem, 'subjectType'> & {
    subjectType: AcceptanceItem['subjectType'] | 'goal';
  },
) => {
  let readable = Boolean(ctx.userId) && ctx.userId === acceptance.userId;
  if (!readable) readable = acceptance.visibility === 'public';
  if (!readable && ctx.userId && acceptance.workspaceId) {
    readable = Boolean(
      await new WorkspaceMemberModel(ctx.serverDB, ctx.userId).getMember(
        acceptance.workspaceId,
        ctx.userId,
      ),
    );
  }
  if (!readable) return false;
  if (
    acceptance.projectId &&
    (!ctx.userId ||
      !(await new ProjectModel(
        ctx.serverDB,
        ctx.userId,
        acceptance.workspaceId ?? undefined,
      ).findById(acceptance.projectId)))
  )
    return false;
  if (acceptance.subjectType === 'task')
    return canReadIssue(ctx, acceptance.subjectId, acceptance.workspaceId);
  if (acceptance.subjectType === 'topic')
    return canReadArchiveTopic(ctx, acceptance.subjectId, acceptance.workspaceId);
  if (acceptance.subjectType === 'goal') {
    if (!ctx.userId) return false;
    const goal = await new GoalModel(
      ctx.serverDB,
      ctx.userId,
      acceptance.workspaceId ?? undefined,
    ).findById(acceptance.subjectId);
    if (!goal) return false;
    return (
      !goal.projectId ||
      Boolean(
        await new ProjectModel(
          ctx.serverDB,
          ctx.userId,
          acceptance.workspaceId ?? undefined,
        ).findById(goal.projectId),
      )
    );
  }
  if (acceptance.subjectType === 'document') {
    return Boolean(
      ctx.userId &&
      (await new DocumentModel(
        ctx.serverDB,
        ctx.userId,
        acceptance.workspaceId ?? undefined,
      ).findById(acceptance.subjectId)),
    );
  }
  // Public standalone reports retain their original link policy.
  return true;
};

export const canReadVerifyRunArchive = async (
  ctx: ArchiveReader,
  run: Pick<
    VerifyRunItem,
    'acceptanceId' | 'operationId' | 'visibility' | 'userId' | 'workspaceId'
  >,
) => {
  if (run.acceptanceId) {
    const acceptance = await ctx.serverDB.query.acceptances.findFirst({
      where: eq(acceptances.id, run.acceptanceId),
    });
    return Boolean(acceptance && (await canReadAcceptanceArchive(ctx, acceptance)));
  }
  let readable = Boolean(ctx.userId) && ctx.userId === run.userId;
  if (!readable) readable = run.visibility === 'public';
  if (!readable && ctx.userId && run.workspaceId) {
    readable = Boolean(
      await new WorkspaceMemberModel(ctx.serverDB, ctx.userId).getMember(
        run.workspaceId,
        ctx.userId,
      ),
    );
  }
  if (!readable) return false;
  if (run.operationId) {
    // Resolve only subject IDs before authorizing; do not load owner-bound transcripts or files.
    const operation = await ctx.serverDB.query.agentOperations.findFirst({
      columns: { taskId: true, topicId: true },
      where: eq(agentOperations.id, run.operationId),
    });
    if (!operation) return false;
    if (operation.taskId) return canReadIssue(ctx, operation.taskId, run.workspaceId);
    if (operation.topicId) return canReadArchiveTopic(ctx, operation.topicId, run.workspaceId);
  }
  return true;
};
