'use client';

import { FilePlugin, UploadPlugin, useLexicalComposerContext } from '@lobehub/editor';
import { type FC, useCallback, useLayoutEffect, useRef } from 'react';

import type { EditorFileUploadTracker } from './editorFileUploadTracker';
import { createEditorFileUploadTracker } from './editorFileUploadTracker';
import { LinearFileCard } from './LinearFileCard';
import { preserveInsertedFileSize } from './preserveInsertedFileSize';
import type { EditorAttachmentUpload } from './useImageUpload';

export { LinearFileCard } from './LinearFileCard';

interface LinearFilePluginProps {
  handleUpload: EditorAttachmentUpload;
  /**
   * Class applied to the outer Lexical `<span>` wrapper. Set to a block-level
   * style so the file card claims its own line in the paragraph.
   */
  theme?: { file?: string };
}

const LinearFilePlugin: FC<LinearFilePluginProps> = ({ handleUpload, theme }) => {
  const [editor] = useLexicalComposerContext();
  const uploadTrackerRef = useRef<EditorFileUploadTracker | null>(null);
  if (!uploadTrackerRef.current) uploadTrackerRef.current = createEditorFileUploadTracker();
  const uploadTracker = uploadTrackerRef.current;
  const trackedHandleUpload = useCallback<EditorAttachmentUpload>(
    async (file) => {
      preserveInsertedFileSize(file);
      const uploadId = uploadTracker.start(file);

      try {
        const result = await handleUpload(file, (status, uploadState) => {
          uploadTracker.update(uploadId, status, uploadState);
        });
        uploadTracker.finish(uploadId);
        return result;
      } catch (error) {
        uploadTracker.update(uploadId, 'error');
        uploadTracker.finish(uploadId);
        throw error;
      }
    },
    [handleUpload, uploadTracker],
  );

  useLayoutEffect(() => {
    editor.registerPlugin(UploadPlugin);
    editor.registerPlugin(FilePlugin, {
      decorator: (node) => <LinearFileCard node={node} uploadTracker={uploadTracker} />,
      handleUpload: trackedHandleUpload,
      theme,
    });
  }, [editor, trackedHandleUpload, theme, uploadTracker]);

  return null;
};

LinearFilePlugin.displayName = 'LinearFilePlugin';

export default LinearFilePlugin;
