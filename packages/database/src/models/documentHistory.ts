import { and, desc, eq, exists, lt, or, sql } from 'drizzle-orm';

import type { DocumentHistoryItem, NewDocumentHistory } from '../schemas';
import { documentHistories, documents } from '../schemas';
import type { OrviloDatabase } from '../type';
import { buildDocumentReadableWhere, buildDocumentWritableWhere } from '../utils/documentAccess';
import { buildWorkspacePayload, buildWorkspaceWhere } from '../utils/workspace';

export interface QueryDocumentHistoryParams {
  beforeId?: string;
  beforeSavedAt?: Date;
  documentId: string;
  limit?: number;
}

export class DocumentHistoryModel {
  private userId: string;
  private workspaceId?: string;
  private db: OrviloDatabase;

  constructor(db: OrviloDatabase, userId: string, workspaceId?: string) {
    this.userId = userId;
    this.workspaceId = workspaceId;
    this.db = db;
  }

  private workspaceOwnership() {
    return buildWorkspaceWhere(
      { userId: this.userId, workspaceId: this.workspaceId },
      documentHistories,
    );
  }

  private ownership(mode: 'read' | 'write' = 'read') {
    const documentWhere =
      mode === 'read'
        ? buildDocumentReadableWhere(this.db, {
            userId: this.userId,
            workspaceId: this.workspaceId,
          })
        : buildDocumentWritableWhere(this.db, {
            userId: this.userId,
            workspaceId: this.workspaceId,
          });
    return and(
      this.workspaceOwnership(),
      exists(
        this.db
          .select({ one: sql`1` })
          .from(documents)
          .where(and(eq(documents.id, documentHistories.documentId), documentWhere)),
      ),
    );
  }

  create = async (params: Omit<NewDocumentHistory, 'userId'>): Promise<DocumentHistoryItem> => {
    const [document] = await this.db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.id, params.documentId),
          buildDocumentWritableWhere(this.db, {
            userId: this.userId,
            workspaceId: this.workspaceId,
          }),
        ),
      )
      .limit(1);

    if (!document) {
      throw new Error('Document not found');
    }

    const [result] = await this.db
      .insert(documentHistories)
      .values(buildWorkspacePayload({ userId: this.userId, workspaceId: this.workspaceId }, params))
      .returning();

    return result!;
  };

  delete = async (id: string) => {
    return this.db
      .delete(documentHistories)
      .where(and(eq(documentHistories.id, id), this.ownership('write')));
  };

  deleteByDocumentId = async (documentId: string) => {
    return this.db
      .delete(documentHistories)
      .where(and(eq(documentHistories.documentId, documentId), this.ownership('write')));
  };

  deleteAll = async () => {
    return this.db.delete(documentHistories).where(this.workspaceOwnership());
  };

  findById = async (id: string): Promise<DocumentHistoryItem | undefined> => {
    const [result] = await this.db
      .select()
      .from(documentHistories)
      .where(and(eq(documentHistories.id, id), this.ownership()))
      .limit(1);

    return result;
  };

  findLatestByDocumentId = async (documentId: string): Promise<DocumentHistoryItem | undefined> => {
    const [result] = await this.db
      .select()
      .from(documentHistories)
      .where(and(eq(documentHistories.documentId, documentId), this.ownership()))
      .orderBy(desc(documentHistories.savedAt), desc(documentHistories.id))
      .limit(1);

    return result;
  };

  list = async ({
    beforeId,
    beforeSavedAt,
    documentId,
    limit = 50,
  }: QueryDocumentHistoryParams): Promise<DocumentHistoryItem[]> => {
    const conditions = [eq(documentHistories.documentId, documentId), this.ownership()];

    if (beforeSavedAt !== undefined) {
      if (beforeId !== undefined) {
        const cursorCondition = or(
          lt(documentHistories.savedAt, beforeSavedAt),
          and(eq(documentHistories.savedAt, beforeSavedAt), lt(documentHistories.id, beforeId)),
        );
        if (cursorCondition) {
          conditions.push(cursorCondition);
        }
      } else {
        conditions.push(lt(documentHistories.savedAt, beforeSavedAt));
      }
    }

    return this.db
      .select()
      .from(documentHistories)
      .where(and(...conditions))
      .orderBy(desc(documentHistories.savedAt), desc(documentHistories.id))
      .limit(limit);
  };

  query = async (params: QueryDocumentHistoryParams): Promise<DocumentHistoryItem[]> => {
    return this.list(params);
  };

  listByDocumentId = async (documentId: string, limit = 50): Promise<DocumentHistoryItem[]> => {
    return this.list({ documentId, limit });
  };
}
