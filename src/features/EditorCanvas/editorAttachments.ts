import type { IEditor } from '@lobehub/editor';
import {
  extractMediaFromEditorState,
  INSERT_FILE_COMMAND,
  INSERT_IMAGE_COMMAND,
} from '@lobehub/editor';
import type { SerializedEditorState } from 'lexical';

import { getFileIdForUrl, registerAttachment } from './attachmentRegistry';
import {
  existingAttachmentByFile,
  type ExistingEditorAttachment,
} from './editorAttachmentTransfer';

export {
  type ExistingEditorAttachment,
  getExistingEditorAttachment,
} from './editorAttachmentTransfer';

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

/**
 * URLs that have no registered fileId (e.g. externally pasted image URLs)
 * are silently skipped.
 */
export const getAttachmentFileIdsFromJson = (json: unknown): string[] => {
  if (!json) return [];
  const { imageList, fileList } = extractMediaFromEditorState(json as SerializedEditorState);
  const seen = new Set<string>();
  for (const { url } of imageList) {
    const fileId = getFileIdForUrl(url);
    if (fileId) seen.add(fileId);
  }
  for (const { url } of fileList) {
    const fileId = getFileIdForUrl(url);
    if (fileId) seen.add(fileId);
  }
  return [...seen];
};

export const getAttachmentFileIdsFromEditor = (editor: IEditor | undefined): string[] => {
  if (!editor?.getLexicalEditor?.()) return [];
  return getAttachmentFileIdsFromJson(editor.getDocument?.('json'));
};

/**
 * Images → `INSERT_IMAGE_COMMAND`; everything else → `INSERT_FILE_COMMAND`.
 */
export const insertFilesIntoEditor = (editor: IEditor | undefined, files: File[]): void => {
  if (!editor || files.length === 0) return;
  const lexicalEditor = editor.getLexicalEditor?.();
  if (!lexicalEditor) return;
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      lexicalEditor.dispatchCommand(INSERT_IMAGE_COMMAND, { file });
    } else {
      lexicalEditor.dispatchCommand(INSERT_FILE_COMMAND, { file });
    }
  }
  // File picker / Upload dropdown steals focus; restore it so the cursor
  // remains visible and the user can keep typing.
  editor.focus?.();
};

/**
 * Insert already-uploaded library files without downloading or uploading them again.
 * The editor's file plugin still receives a `File`, while the upload adapter resolves
 * that placeholder straight back to the existing resource URL and file id.
 */
export const insertExistingAttachmentsIntoEditor = (
  editor: IEditor | undefined,
  attachments: ExistingEditorAttachment[],
): void => {
  if (!editor || attachments.length === 0) return;
  const lexicalEditor = editor.getLexicalEditor?.();
  if (!lexicalEditor) return;

  for (const attachment of attachments) {
    const file = new File([], attachment.name, { type: attachment.fileType });
    Object.defineProperty(file, 'size', { value: attachment.size });
    existingAttachmentByFile.set(file, attachment);
    registerAttachment(attachment.url, attachment.fileId);
    lexicalEditor.dispatchCommand(INSERT_FILE_COMMAND, { file });
  }

  editor.focus?.();
};

export interface AttachmentInsertGuard {
  /**
   * Re-checked both before the native picker opens and when it resolves — the
   * entity or edit rights captured at click time may have changed while the
   * dialog was open (another task selected, an edit lock lost). Return false
   * to drop the picked files without dispatching an insert.
   */
  canInsert: () => boolean;
  /**
   * Called when the guard rejects the pick, at click time or on dialog
   * resolution, so the caller can explain why (e.g. a toast).
   */
  onBlocked?: () => void;
}

export const pickAndInsertAttachments = (
  editor: IEditor | undefined,
  accept?: string,
  guard?: AttachmentInsertGuard,
): void => {
  if (!editor?.getLexicalEditor?.()) return;
  if (guard && !guard.canInsert()) {
    guard.onBlocked?.();
    return;
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  if (accept) input.accept = accept;

  input.addEventListener('change', () => {
    if (guard && !guard.canInsert()) {
      guard.onBlocked?.();
      return;
    }
    insertFilesIntoEditor(editor, Array.from(input.files ?? []));
  });

  input.click();
};

export { preserveInsertedFileSize, preservePendingFileNodeSize } from './preserveInsertedFileSize';
