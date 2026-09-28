import {
  getRegisteredAttachment,
  seedAttachments,
} from '@/features/EditorCanvas/attachmentRegistry';
import { getAttachmentFileIdsFromJson } from '@/features/EditorCanvas/editorAttachments';

interface DraftAttachment {
  downloadUrl?: string;
  id: string;
  url: string;
}

interface StoredDraftEditorData {
  attachments: DraftAttachment[];
  document: unknown;
  version: 1;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export const packDraftEditorData = (document: unknown): StoredDraftEditorData => {
  const attachments: DraftAttachment[] = [];
  const visited = new Set<string>();
  const queue: unknown[] = [document];
  while (queue.length > 0) {
    const node = queue.pop();
    if (!isRecord(node)) continue;
    const url =
      node.type === 'file'
        ? node.fileUrl
        : node.type === 'image' || node.type === 'block-image'
          ? node.src
          : undefined;
    if (typeof url === 'string' && !visited.has(url)) {
      const registered = getRegisteredAttachment(url);
      if (registered) {
        attachments.push({ id: registered.fileId, url, downloadUrl: registered.downloadUrl });
        visited.add(url);
      }
    }
    if (Array.isArray(node.children)) queue.push(...node.children);
    if (node.root) queue.push(node.root);
  }
  return { attachments, document, version: 1 };
};

export const unpackDraftEditorData = (stored: unknown) => {
  if (!isRecord(stored) || stored.version !== 1 || !('document' in stored)) {
    return { document: stored, hasAttachments: getAttachmentFileIdsFromJson(stored).length > 0 };
  }
  const attachments = Array.isArray(stored.attachments)
    ? stored.attachments.filter(
        (item): item is DraftAttachment =>
          isRecord(item) && typeof item.id === 'string' && typeof item.url === 'string',
      )
    : [];
  seedAttachments(attachments);
  return {
    document: stored.document,
    hasAttachments: getAttachmentFileIdsFromJson(stored.document).length > 0,
  };
};
