export interface EditorAttachmentState {
  hasCompletedAttachments: boolean;
  hasIncompleteAttachments: boolean;
}

const toRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

export const getEditorAttachmentStateFromJson = (json: unknown): EditorAttachmentState => {
  const pending: unknown[] = [json];
  let hasCompletedAttachments = false;
  let hasIncompleteAttachments = false;

  while (pending.length > 0) {
    const node = toRecord(pending.pop());
    if (!node) continue;

    const isFile = node.type === 'file';
    const isImage = node.type === 'image' || node.type === 'block-image';
    if (isFile || isImage) {
      const url = isFile ? node.fileUrl : node.src;
      if (node.status === 'uploaded' && typeof url === 'string' && url.length > 0) {
        hasCompletedAttachments = true;
      } else {
        hasIncompleteAttachments = true;
      }
    }

    if (Array.isArray(node.children)) pending.push(...node.children);
    if (node.root) pending.push(node.root);
  }

  return { hasCompletedAttachments, hasIncompleteAttachments };
};
