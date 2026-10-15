'use client';

import type { LexicalNode } from 'lexical';
import { useState } from 'react';

import { createEditorFileUploadTracker } from '@/features/EditorCanvas/editorFileUploadTracker';
import { LinearFileCard } from '@/features/EditorCanvas/LinearFileCard';
import { preserveInsertedFileSize } from '@/features/EditorCanvas/preserveInsertedFileSize';
import type { EditorAttachmentUpload } from '@/features/EditorCanvas/useImageUpload';

interface NativeFileNode extends LexicalNode {
  readonly fileUrl?: string;
  readonly message?: string;
  readonly name: string;
  readonly size?: number;
  readonly status?: 'pending' | 'uploaded' | 'error';
}

/** Structural guard permits the actual native FileNode without constructing or
 * importing a second SDK node class. The kernel owns commands and selection. */
function isFileNode(node: LexicalNode): node is NativeFileNode {
  return node.getType() === 'file' && 'name' in node && typeof node.name === 'string';
}

/** Pass the existing useFileUpload result. This owner creates no upload service,
 * fallback endpoint or transient object URL. NativePageEditor registers this
 * owner before native FilePlugin initializes. */
export function useNativeFileOwner(
  handleUpload: EditorAttachmentUpload,
  theme?: { file?: string },
) {
  const [tracker] = useState(createEditorFileUploadTracker);
  return {
    decorator(node: LexicalNode) {
      if (!isFileNode(node)) throw new Error('Native file owner received a non-file node');
      return <LinearFileCard node={node} uploadTracker={tracker} />;
    },
    async handleUpload(file: File) {
      // FilePlugin calls from the insertion transaction, before awaiting upload.
      preserveInsertedFileSize(file);
      const id = tracker.start(file);
      try {
        const result = await handleUpload(file, (status, state) =>
          tracker.update(id, status, state),
        );
        tracker.finish(id);
        return result;
      } catch (error) {
        tracker.update(id, 'error');
        tracker.finish(id);
        throw error;
      }
    },
    theme,
  };
}

export type NativeFileOwner = ReturnType<typeof useNativeFileOwner>;
