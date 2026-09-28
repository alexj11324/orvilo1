import type { IEditor } from '@lobehub/editor';
import { useCallback, useEffect, useRef } from 'react';

import {
  packDraftEditorData,
  unpackDraftEditorData,
} from '@/features/AgentTasks/AgentTaskDetail/draftEditorData';
import { getAttachmentFileIdsFromEditor } from '@/features/EditorCanvas/editorAttachments';

import {
  createTaskCreateDraftId,
  removeTaskCreateDraft,
  saveTaskCreateDraft,
  type TaskCreateDraft,
  type TaskCreateDraftFields,
} from './taskCreateDrafts';

const SAVE_DELAY_MS = 400;

interface UseTaskCreateDraftSyncOptions {
  /**
   * Apply a reopened draft to the composer's React state (title, priority,
   * assignees, visibility, team) and mirror `markdown` into the instruction
   * ref so an immediate submit carries the restored body. The editor document
   * itself is restored by this hook before `applyDraft` runs.
   */
  applyDraft: (draft: TaskCreateDraft, markdown: string) => void;
  /** The draft being continued, when the composer was opened from Drafts. */
  draft?: TaskCreateDraft;
  editor: IEditor | undefined;
  /** Persist only when the user may actually create (permission gate). */
  enabled: boolean;
  /** Current scalar composer state — read through a ref at save time. */
  fields: TaskCreateDraftFields;
  workspaceId: string | null;
}

interface TaskCreateDraftSync {
  /** Call once a submit has succeeded: removes the draft and blocks the unmount flush. */
  markSubmitted: () => void;
  /** Debounce a persist of the current composer state (editor changes). */
  schedule: () => void;
}

/**
 * Continue-editing wiring for the create-issue composer.
 *
 * - A `draft` prop rehydrates title/editor/properties once the editor exists.
 * - Every change (scalar fields via deps, editor body via `schedule`) debounce-
 *   writes to the issue-draft store; a non-empty composer closed without
 *   submitting lands on the Drafts page, matching Linear's create modal.
 * - An emptied-out composer deletes its draft; a successful submit removes it.
 */
export const useTaskCreateDraftSync = ({
  applyDraft,
  draft,
  editor,
  enabled,
  fields,
  workspaceId,
}: UseTaskCreateDraftSyncOptions): TaskCreateDraftSync => {
  // The draft id this composer session owns: seeded from a reopened draft,
  // allocated lazily on the first non-empty persist for a fresh composer.
  const draftIdRef = useRef<string | undefined>(draft?.id);
  const hydratedRef = useRef<string | null>(null);
  const submittedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const applyDraftRef = useRef(applyDraft);
  applyDraftRef.current = applyDraft;

  const latest = useRef({ draft, editor, enabled, fields, workspaceId });
  latest.current = { draft, editor, enabled, fields, workspaceId };

  // Rehydrate once per draft id — the editor mounts after the modal's first
  // render, so this waits for it rather than running on mount only.
  useEffect(() => {
    if (!draft || !editor || hydratedRef.current === draft.id) return;
    hydratedRef.current = draft.id;
    if (draft.editorData) {
      const restored = unpackDraftEditorData(draft.editorData);
      if (restored.document !== null && restored.document !== undefined) {
        editor.setDocument?.(
          'json',
          typeof restored.document === 'string'
            ? restored.document
            : JSON.stringify(restored.document),
        );
      } else if (draft.content) {
        editor.setDocument?.('markdown', draft.content);
      }
    } else if (draft.content) {
      editor.setDocument?.('markdown', draft.content);
    }
    // `setDocument` may apply asynchronously — fall back to the stored body so
    // an immediate submit still carries it. (`persist` must NOT fall back: an
    // empty read there means the user cleared the composer.)
    const markdown = String(editor.getDocument?.('markdown') || draft.content || '');
    applyDraftRef.current(draft, markdown);
  }, [draft, editor]);

  const persist = useCallback(() => {
    const current = latest.current;
    if (submittedRef.current || !current.enabled) return;
    // Never write over a reopened draft before its values have been applied.
    if (current.draft && hydratedRef.current !== current.draft.id) return;

    const content = String(current.editor?.getDocument?.('markdown') ?? '').trim();
    const hasAttachments = getAttachmentFileIdsFromEditor(current.editor).length > 0;
    if (!current.fields.title.trim() && !content && !hasAttachments) {
      // Emptied composer: the draft goes away entirely (Linear drops empty
      // drafts). Without an allocated id there is nothing to remove.
      if (draftIdRef.current) {
        removeTaskCreateDraft(current.workspaceId, draftIdRef.current);
      }
      return;
    }

    const id = (draftIdRef.current ??= createTaskCreateDraftId());
    saveTaskCreateDraft(current.workspaceId, {
      ...current.fields,
      content,
      // No editor (e.g. flushed before mount): keep the markdown body only.
      editorData: current.editor
        ? packDraftEditorData(current.editor.getDocument?.('json'))
        : undefined,
      hasAttachments,
      id,
    });
  }, []);

  const schedule = useCallback(() => {
    if (submittedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(persist, SAVE_DELAY_MS);
  }, [persist]);

  // Scalar field edits (title, priority, assignees, visibility, team) schedule
  // a save; editor body edits arrive through `schedule()` from onContentChange.
  const serializedFields = JSON.stringify(fields);
  const prevFieldsRef = useRef(serializedFields);
  useEffect(() => {
    if (prevFieldsRef.current === serializedFields) return;
    prevFieldsRef.current = serializedFields;
    if (!enabled) return;
    // Never write over a reopened draft before its values have been applied.
    if (draft && hydratedRef.current !== draft.id) return;
    schedule();
  }, [draft, enabled, schedule, serializedFields]);

  // Closing the modal (mask, X, Esc, programmatic) unmounts the composer —
  // flush the latest state so nothing typed since the last debounce is lost.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      persist();
    },
    [persist],
  );

  const markSubmitted = useCallback(() => {
    submittedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (draftIdRef.current) {
      removeTaskCreateDraft(latest.current.workspaceId, draftIdRef.current);
      draftIdRef.current = undefined;
    }
  }, []);

  return { markSubmitted, schedule };
};
