'use client';

import debug from 'debug';
import { debounce } from 'es-toolkit/compat';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { confirmModal } from '@/components/Modal';
import type { EditLockHealth } from '@/features/EditLock/useEditLock';
import { useDocumentStore } from '@/store/document';
import { editorSelectors } from '@/store/document/slices/editor';
import type { DocumentEditorPort } from '@/store/document/types';

import {
  clearPageDraft,
  DRAFT_WRITE_DEBOUNCE_MS,
  readPageDraft,
  writeDraft,
} from '../pageDraftStorage';

const log = debug('page:native:draft');

/** Invoke only after the host's onInit has hydrated persisted content. Storage is
 * shared with the legacy page, but no SDK provider/store is imported. */
export function useNativePageDraft({
  documentId,
  editor,
  health,
  ownerId,
  editable,
}: {
  documentId: string;
  editor?: DocumentEditorPort;
  health: EditLockHealth;
  ownerId?: string;
  editable: boolean;
}) {
  const { t } = useTranslation('file');
  const isDirty = useDocumentStore(editorSelectors.isDirty(documentId));
  const editorData = useDocumentStore(editorSelectors.editorData(documentId));
  const writer = useMemo(
    () => debounce(writeDraft, DRAFT_WRITE_DEBOUNCE_MS, { leading: false, trailing: true }),
    [],
  );
  const prompted = useRef(false);
  const [restorationChecked, setRestorationChecked] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const modalRef = useRef<{ destroy: () => void } | undefined>(undefined);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      modalRef.current?.destroy();
      prompted.current = false;
    };
  }, []);
  const live = useRef({ editor, editable });
  live.current = { editor, editable };

  useEffect(() => {
    if (!editor || health === 'healthy' || !isDirty) return;
    writer({
      documentId,
      editorData: editor.getDocument('json'),
      ownerId,
      savedAt: new Date().toISOString(),
    });
  }, [documentId, editor, editorData, health, isDirty, ownerId, writer]);
  useEffect(
    () => () => {
      writer.flush();
      writer.cancel();
    },
    [writer],
  );

  useEffect(() => {
    if (!editor || !editable || isDirty || prompted.current) return;
    prompted.current = true;
    const draft = readPageDraft(documentId);
    if (!draft) {
      setRestorationChecked(true);
      return;
    }
    setPromptOpen(true);
    modalRef.current = confirmModal({
      cancelText: t('pageEditor.editMode.draftRestoreCancel'),
      content: t('pageEditor.editMode.draftRestoreContent'),
      okText: t('pageEditor.editMode.draftRestoreOk'),
      title: t('pageEditor.editMode.draftRestoreTitle'),
      onCancel: () => {
        clearPageDraft(documentId);
        if (alive.current) {
          setRestorationChecked(true);
          setPromptOpen(false);
        }
      },
      onOk: () => {
        const state = useDocumentStore.getState();
        const current = live.current;
        // A delayed confirmation cannot overwrite new edits, another document,
        // or a page whose lease/permission changed while the dialog was open.
        if (
          !alive.current ||
          !current.editable ||
          current.editor !== editor ||
          state.activeDocumentId !== documentId ||
          state.editor !== editor ||
          state.documents[documentId]?.isDirty
        ) {
          if (alive.current) {
            prompted.current = false;
            setPromptOpen(false);
          }
          return;
        }
        try {
          if (draft.editorData && typeof draft.editorData === 'object') {
            editor.setDocument('json', JSON.stringify(draft.editorData));
            state.handleContentChange();
          }
          clearPageDraft(documentId);
          setRestorationChecked(true);
        } catch (error) {
          prompted.current = false;
          log('failed to restore draft for %s: %O', documentId, error);
        } finally {
          setPromptOpen(false);
        }
      },
    });
  }, [documentId, editor, editable, isDirty, t]);

  useEffect(() => {
    // Never clear the recovery draft merely because the initial fetched page
    // is clean: the user must first have a chance to accept/decline restoration.
    if (!editable || !restorationChecked || promptOpen || health !== 'healthy' || isDirty) return;
    writer.cancel();
    clearPageDraft(documentId);
  }, [documentId, editable, health, isDirty, promptOpen, restorationChecked, writer]);
}
