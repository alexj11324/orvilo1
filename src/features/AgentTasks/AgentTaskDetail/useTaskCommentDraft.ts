import type { IEditor } from '@lobehub/editor';
import { useCallback, useEffect, useRef } from 'react';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { getAttachmentFileIdsFromEditor } from '@/features/EditorCanvas/editorAttachments';
import { mutate } from '@/libs/swr';
import { taskDraftKeys, taskDraftService } from '@/services/taskDraft';

import { packDraftEditorData, unpackDraftEditorData } from './draftEditorData';

interface DraftSnapshot {
  content: string;
  editorData: unknown;
  hasAttachments: boolean;
}

const SAVE_DELAY_MS = 300;

export const useTaskCommentDraft = (
  taskId: string,
  editor: IEditor | undefined,
  editable: boolean,
  onRestore: (content: string, hasAttachments: boolean) => void,
  onSaveError: () => void,
) => {
  const workspaceId = useActiveWorkspaceId();
  // This composer belongs to the workspace where it mounted. A queued save
  // must keep that scope after navigation changes the active header context.
  const draftWorkspaceId = useRef(workspaceId).current;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<Promise<void> | undefined>(undefined);
  const latest = useRef<DraftSnapshot | null>(null);
  const dirty = useRef(false);
  const restoring = useRef(false);
  const clearing = useRef(false);
  const onRestoreRef = useRef(onRestore);
  const onSaveErrorRef = useRef(onSaveError);
  onRestoreRef.current = onRestore;
  onSaveErrorRef.current = onSaveError;

  const refresh = useCallback(() => {
    void mutate(taskDraftKeys.list(draftWorkspaceId)).catch((error) =>
      console.error('[TaskCommentDraft] List refresh failed:', error),
    );
    void mutate(taskDraftKeys.count(draftWorkspaceId)).catch((error) =>
      console.error('[TaskCommentDraft] Count refresh failed:', error),
    );
  }, [draftWorkspaceId]);

  const queueSave = useCallback(
    (snapshot: DraftSnapshot) => {
      pending.current = (pending.current ?? Promise.resolve()).then(async () => {
        try {
          if (!snapshot.content && !snapshot.hasAttachments) {
            await taskDraftService.delete(taskId, draftWorkspaceId);
          } else {
            await taskDraftService.upsert(
              {
                content: snapshot.content,
                editorData: snapshot.editorData,
                taskId,
              },
              draftWorkspaceId,
            );
          }
          refresh();
        } catch (error) {
          console.error('[TaskCommentDraft] Save failed:', error);
          onSaveErrorRef.current();
        }
      });
    },
    [draftWorkspaceId, refresh, taskId],
  );

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
    if (latest.current && !clearing.current) {
      queueSave(latest.current);
      latest.current = null;
    }
  }, [queueSave]);

  useEffect(() => {
    if (!editor || !editable) return;
    let disposed = false;
    dirty.current = false;
    taskDraftService
      .get(taskId, draftWorkspaceId)
      .then(({ data }) => {
        if (disposed || dirty.current || !data) return;
        restoring.current = true;
        try {
          if (data.editorData) {
            const restored = unpackDraftEditorData(data.editorData);
            editor.setDocument(
              'json',
              typeof restored.document === 'string'
                ? restored.document
                : JSON.stringify(restored.document),
            );
            onRestoreRef.current(data.content, restored.hasAttachments);
          } else {
            editor.setDocument('markdown', data.content);
            onRestoreRef.current(data.content, false);
          }
        } finally {
          queueMicrotask(() => {
            restoring.current = false;
          });
        }
      })
      .catch((error) => {
        console.error('[TaskCommentDraft] Load failed:', error);
        onSaveErrorRef.current();
      });
    return () => {
      disposed = true;
      flush();
    };
  }, [draftWorkspaceId, editable, editor, flush, taskId]);

  const onChange = useCallback(() => {
    if (!editor || !editable || restoring.current || clearing.current) return;
    dirty.current = true;
    const content = String(editor.getDocument('markdown') ?? '').trim();
    latest.current = {
      content,
      editorData: packDraftEditorData(editor.getDocument('json')),
      hasAttachments: getAttachmentFileIdsFromEditor(editor).length > 0,
    };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  }, [editable, editor, flush]);

  const clearAfterSend = useCallback(async () => {
    clearing.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
    latest.current = null;
    // In-flight upserts complete before deletion, so an earlier autosave
    // cannot recreate a draft after the comment has been sent.
    await pending.current;
    try {
      await taskDraftService.delete(taskId, draftWorkspaceId);
      refresh();
    } catch (error) {
      console.error('[TaskCommentDraft] Clear after send failed:', error);
      onSaveErrorRef.current();
    } finally {
      clearing.current = false;
    }
  }, [draftWorkspaceId, refresh, taskId]);

  return { clearAfterSend, onChange };
};
