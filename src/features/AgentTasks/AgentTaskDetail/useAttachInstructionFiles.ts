import type { IEditor } from '@lobehub/editor';
import { toast } from '@lobehub/ui/base-ui';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { pickAndInsertAttachments } from '@/features/EditorCanvas/editorAttachments';

interface UseAttachInstructionFilesOptions {
  /**
   * The same capability that gates the instruction body: permission AND
   * edit-lock health. Ref-checked so a mid-flight picker resolution sees the
   * current value, not the one captured at click time.
   */
  editable: boolean;
  editor: IEditor | undefined;
  /** The task the picker was opened for; a later resolution must still match. */
  taskId: string | null;
}

/**
 * Attachment entry point for the task instruction. The native file dialog is
 * async — the user can switch tasks or lose the edit lock while it is open —
 * so the allowed-to-insert decision is revalidated at both edges: before the
 * picker opens (guarded by `canInsert` up front) and inside its change
 * callback, against the task and editability captured at click time.
 */
export const useAttachInstructionFiles = ({
  editable,
  editor,
  taskId,
}: UseAttachInstructionFilesOptions) => {
  const { t } = useTranslation('chat');
  const editableRef = useRef(editable);
  editableRef.current = editable;
  const taskIdRef = useRef(taskId);
  taskIdRef.current = taskId;
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return useCallback(() => {
    const initiatedTaskId = taskIdRef.current;
    pickAndInsertAttachments(editor, undefined, {
      canInsert: () =>
        mountedRef.current && editableRef.current && taskIdRef.current === initiatedTaskId,
      onBlocked: () => toast.error(t('taskDetail.attachmentsUnavailable')),
    });
  }, [editor, t]);
};
