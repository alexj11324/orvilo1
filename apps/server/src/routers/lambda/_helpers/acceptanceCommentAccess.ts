import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';

import { WorkspaceMemberModel } from '@/database/models/workspaceMember';
import type { AcceptanceItem } from '@/database/schemas/verify';
import { acceptances } from '@/database/schemas/verify';
import type { OrviloDatabase } from '@/database/type';
import { isUuid } from '@/database/utils/uuid';
import { canReadAcceptanceArchive } from '@/server/services/verify/archiveAccess';

export interface AcceptanceCommentAccess {
  acceptance: AcceptanceItem;
  /** Archived discussions never offer approval writes. */
  canApprove: boolean;
  /** Archived comments, annotations and reactions are read-only. */
  canComment: boolean;
  isOwner: boolean;
  /** The workspace whose agents this caller may sign as — only their own. */
  memberOfWorkspaceId?: string;
}

/** Resolve historical discussion visibility, including its subject Project ceiling. */
export async function resolveAcceptanceCommentAccess(
  db: OrviloDatabase,
  userId: string | null | undefined,
  acceptanceId: string,
): Promise<AcceptanceCommentAccess> {
  const [acceptance] = isUuid(acceptanceId)
    ? await db.select().from(acceptances).where(eq(acceptances.id, acceptanceId)).limit(1)
    : [];
  if (!acceptance) throw new TRPCError({ code: 'NOT_FOUND', message: 'Acceptance not found' });

  const isOwner = Boolean(userId) && userId === acceptance.userId;
  const member =
    !isOwner && userId && acceptance.workspaceId
      ? await new WorkspaceMemberModel(db, userId).getMember(acceptance.workspaceId, userId)
      : undefined;

  const canRead = await canReadAcceptanceArchive({ serverDB: db, userId }, acceptance);
  if (!canRead) throw new TRPCError({ code: 'NOT_FOUND', message: 'Acceptance not found' });

  const canApprove = false;

  return {
    acceptance,
    canApprove,
    canComment: false,
    isOwner,
    memberOfWorkspaceId: isOwner || member ? (acceptance.workspaceId ?? undefined) : undefined,
  };
}
