import type { SQL, SQLWrapper } from 'drizzle-orm';
import { and, eq, exists, isNotNull, notExists, or, sql } from 'drizzle-orm';

import { files, messages, messagesFiles, topics, works, workVersions } from '../schemas';
import type { OrviloDatabase } from '../type';
import { buildTopicReadableWhere } from './topicReadable';

type Reader = { userId: string; workspaceId?: string };

/** Same topic read as conversations, including a private Project ceiling. */
const readableTopic = (db: OrviloDatabase, ctx: Reader, topicId: SQLWrapper): SQL =>
  exists(
    db
      .select({ one: sql`1` })
      .from(topics)
      .where(and(eq(topics.id, topicId), buildTopicReadableWhere(db, ctx))),
  );

/**
 * File rows attached to a topic the caller cannot read stay out of library
 * reads. Unattached library files keep their workspace visibility. The public
 * `/f/:id` proxy does not use this predicate.
 */
export const buildFileTopicCeiling = (
  db: OrviloDatabase,
  ctx: Reader,
  fileId: SQLWrapper = files.id,
): SQL | undefined => {
  if (!ctx.workspaceId) return undefined;

  return and(
    notExists(
      db
        .select({ one: sql`1` })
        .from(messagesFiles)
        .innerJoin(messages, eq(messages.id, messagesFiles.messageId))
        .where(
          and(
            eq(messagesFiles.fileId, fileId),
            isNotNull(messages.topicId),
            notExists(
              db
                .select({ one: sql`1` })
                .from(topics)
                .where(and(eq(topics.id, messages.topicId), buildTopicReadableWhere(db, ctx))),
            ),
          ),
        ),
    ),
    notExists(
      db
        .select({ one: sql`1` })
        .from(workVersions)
        .where(
          and(
            sql`${workVersions.metadata}->>'fileId' = ${fileId}`,
            isNotNull(workVersions.topicId),
            notExists(
              db
                .select({ one: sql`1` })
                .from(topics)
                .where(and(eq(topics.id, workVersions.topicId), buildTopicReadableWhere(db, ctx))),
            ),
          ),
        ),
    ),
  );
};

/**
 * A row that optionally points at a file. Rows with no file keep their own
 * ACL. Rows whose file is attached to an unreadable topic stay hidden.
 */
export const buildOptionalFileTopicCeiling = (
  db: OrviloDatabase,
  ctx: Reader,
  fileId: SQLWrapper,
): SQL | undefined => {
  const ceiling = buildFileTopicCeiling(db, ctx, fileId);
  if (!ceiling) return undefined;

  return or(sql`${fileId} is null`, ceiling);
};

/**
 * File Works follow their origin topic. Other work types keep their own
 * resource ACL. A missing origin topic is not treated as a private Project.
 */
export const buildFileWorkTopicCeiling = (
  db: OrviloDatabase,
  ctx: Reader,
): SQL | undefined => {
  if (!ctx.workspaceId) return undefined;

  return or(
    sql`${works.resourceType} <> 'file'`,
    sql`${works.originTopicId} is null`,
    readableTopic(db, ctx, works.originTopicId),
  );
};
