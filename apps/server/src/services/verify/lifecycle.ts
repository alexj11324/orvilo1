import { DocumentModel } from '@/database/models/document';
import { TaskModel } from '@/database/models/task';
import type { OrviloDatabase } from '@/database/type';

const MAX_TASK_DOCUMENT_CHARS = 80_000;

export const resolveVerificationDeliverable = async (
  db: OrviloDatabase,
  userId: string,
  deliverable: string,
  taskId?: string | null,
  workspaceId?: string,
): Promise<string> => {
  if (!taskId) return deliverable;

  const pinnedDocuments = await new TaskModel(db, userId, workspaceId).getPinnedDocuments(taskId);
  if (pinnedDocuments.length === 0) return deliverable;

  const documentModel = new DocumentModel(db, userId, workspaceId);
  const documents = await Promise.all(
    pinnedDocuments.map(({ documentId }) => documentModel.findById(documentId)),
  );
  const readableDocuments = documents.filter((document): document is NonNullable<typeof document> =>
    Boolean(document?.content),
  );
  if (readableDocuments.length === 0) return deliverable;

  const taskDocumentContent = readableDocuments
    .map(
      (document) =>
        `## Task document: ${document.title ?? document.id}\n\n${document.content ?? ''}`,
    )
    .join('\n\n');

  return [
    deliverable,
    '# Associated task deliverables',
    taskDocumentContent.slice(0, MAX_TASK_DOCUMENT_CHARS),
  ]
    .filter(Boolean)
    .join('\n\n');
};

export interface RunVerifyOnCompletionParams {
  /** The run's final output / artifacts, judged against the plan. */
  deliverable: string;
  /** The user's task the run had to satisfy. */
  goal: string;
  operationId: string;
}

/** Old queued callbacks are acknowledged without judging or changing any ledger. */
export const runVerifyOnCompletion = async (
  _db: OrviloDatabase,
  _userId: string,
  _params: RunVerifyOnCompletionParams,
  _workspaceId?: string,
): Promise<void> => {};

export const runVerifyAfterEvidenceSubmission = runVerifyOnCompletion;

export const resumeIssueVerification = async (
  _db: OrviloDatabase,
  _userId: string,
  _params: { taskId: string; operationId?: string },
  _workspaceId?: string,
): Promise<void> => {};
