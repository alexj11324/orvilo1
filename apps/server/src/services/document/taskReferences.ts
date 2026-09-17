import { TRPCError } from '@trpc/server';
import { count, inArray } from 'drizzle-orm';

import { taskDocuments } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';

/**
 * A document that a task lists as an artifact cannot be hard-deleted from the
 * resource library.
 *
 * `task_documents.documentId` cascades, so deleting the `documents` row strips
 * the artifact reference from every task that had it — silently, with nothing to
 * confirm and no way to see what was lost. Taking a document off one task is
 * `task.unpinDocument`, which deletes the reference and leaves the document; that
 * is the operation a user means when they want a task to stop listing it.
 *
 * Every reference is counted, not only the caller's: the cascade is global, so a
 * reference the caller cannot see would still be destroyed by their delete.
 *
 * Known bound, shared with `assertContentsNotInRestrictedKnowledgeBase` which
 * sits beside it: `deleteDocument` also removes child pages recursively, and this
 * checks the ids the caller named. A pinned child page under an unpinned parent
 * is therefore not caught here.
 */
export const assertDocumentsNotPinnedToTasks = async (
  ctx: { serverDB: OrviloDatabase },
  ids: string[],
): Promise<void> => {
  // Only `docs_` ids can be document rows; the sibling guard splits the same way
  // because this helper is called with a mixed list.
  const documentIds = ids.filter((id) => id.startsWith('docs_'));
  if (documentIds.length === 0) return;

  const [row] = await ctx.serverDB
    .select({ pinned: count() })
    .from(taskDocuments)
    .where(inArray(taskDocuments.documentId, documentIds));

  const pinned = Number(row?.pinned ?? 0);
  if (pinned === 0) return;

  throw new TRPCError({
    code: 'FORBIDDEN',
    message:
      pinned === 1
        ? 'This document is attached to a task artifact. Remove it from that task before deleting it.'
        : `These documents are attached to ${pinned} task artifacts. Remove them from those tasks before deleting them.`,
  });
};
