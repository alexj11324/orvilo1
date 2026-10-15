'use client';

import type { EditorRuntimeCommandBindings } from '@orvilo/editor-runtime';
import type { NativeIEditorKernel } from '@orvilo/editor-runtime/native-browser';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import NotFound from '@/components/404';
import AsyncError from '@/components/AsyncError';
import { NativePageEditor, type NativePageEditorProps } from '@/components/NativePageEditor';
import { ArticleSkeleton } from '@/components/Skeleton';
import UnsavedChangesGuard from '@/features/EditorCanvas/UnsavedChangesGuard';
import { writeDraft } from '@/features/PageEditor/pageDraftStorage';
import { useRegisterFilesHotkeys, useSaveDocumentHotkey } from '@/hooks/useHotkeys';
import { useDocumentStore } from '@/store/document';
import { editorSelectors } from '@/store/document/slices/editor';

import { bindNativePageRuntime, type NativePageRuntimePort } from './runtimeBinding';
import { useNativeDocumentResource } from './useNativeDocumentResource';

export interface NativePageDocumentHostProps extends Omit<
  NativePageEditorProps,
  'content' | 'type' | 'editable' | 'onReady' | 'onChange' | 'onTextChange'
> {
  autoSave?: boolean;
  beforeSave?: () => Promise<void>;
  disabled?: boolean;
  documentId: string;
  /** Resolved permission + resource access + lock verdict, never default true. */
  editable: boolean;
  footer?: ReactNode;
  getTitle: () => string;
  /** Host chooses chrome; this module never imports the SDK PageEditorProvider. */
  header?: ReactNode;
  lockOwnerId?: string;
  /** Metadata shares the existing leave guard; never mount a second blocker. */
  metadataDirty?: boolean;
  onContentChange?: () => void;
  onInit?: (editor: NativeIEditorKernel) => void;
  /** Invoked only after a requested manual save actually leaves the doc clean. */
  onSave?: () => void;
  /** An exclusively owned Runtime, with native commands supplied by onReady. */
  runtime: NativePageRuntimePort;
  setTitle: (title: string) => void;
}

/** Explicit opt-in entry. A new document ID owns a new editor lifetime. */
export function NativePageDocumentHost(props: NativePageDocumentHostProps) {
  return <NativePageDocumentSession key={props.documentId} {...props} />;
}

function NativePageDocumentSession({
  documentId,
  metadataDirty = false,
  beforeSave,
  editable,
  disabled = false,
  lockOwnerId,
  autoSave = true,
  runtime,
  getTitle,
  setTitle,
  onInit,
  onContentChange,
  onSave,
  header,
  footer,
  ...surface
}: NativePageDocumentHostProps) {
  const { t } = useTranslation(['file', 'ui']);
  const [ready, setReady] = useState<{
    editor: NativeIEditorKernel;
    commands: EditorRuntimeCommandBindings;
  }>();
  const [hydrated, setHydrated] = useState(false);
  const callbacks = useRef({ getTitle, setTitle, onInit, onContentChange, onSave, beforeSave });
  callbacks.current = { getTitle, setTitle, onInit, onContentChange, onSave, beforeSave };
  const hydrationVersion = useRef<string | undefined>(undefined);
  const lastPublishedJSON = useRef<string | undefined>(undefined);
  const hydrating = useRef(false);
  const hydratedRef = useRef(hydrated);
  hydratedRef.current = hydrated;
  const isDirty = useDocumentStore(editorSelectors.isDirty(documentId));
  const blocked = useDocumentStore(editorSelectors.saveBlockedByLock(documentId));
  const documentReady = useDocumentStore((s) => !!s.documents[documentId]);

  useEffect(() => {
    if (!ready) return;
    useDocumentStore.setState({ activeDocumentId: documentId, editor: ready.editor });
    return () => {
      const state = useDocumentStore.getState();
      if (state.activeDocumentId !== documentId || state.editor !== ready.editor) return;
      // Native surface flushes pending text callbacks before its deferred destroy.
      if (hydratedRef.current) {
        state.handleContentChange();
        state.flushSave(documentId);
      }
      useDocumentStore.setState({ activeDocumentId: undefined, editor: undefined });
    };
  }, [documentId, ready]);

  const { data, error, mutate, hydrationDocument } = useNativeDocumentResource(
    documentId,
    ready?.editor,
    autoSave,
  );
  const missingWithEdits = data === null && documentReady && isDirty;
  const canWrite = hydrated && editable && !disabled && !blocked && data !== null;
  useEffect(() => {
    if (!missingWithEdits || !ready) return;
    const state = useDocumentStore.getState();
    if (state.activeDocumentId !== documentId || state.editor !== ready.editor) return;
    const doc = state.documents[documentId];
    if (!doc?.isDirty) return;
    writeDraft({
      documentId,
      editorData: hydrated ? ready.editor.getDocument('json') : doc.editorData,
      ownerId: lockOwnerId,
      savedAt: new Date().toISOString(),
    });
  }, [documentId, hydrated, lockOwnerId, missingWithEdits, ready]);
  const version = hydrationDocument?.updatedAt?.toISOString();
  useEffect(() => {
    if (!ready || !documentReady) return;
    useDocumentStore.getState().internal_dispatchDocument({
      id: documentId,
      type: 'updateDocument',
      value: { lockOwnerId },
    });
  }, [documentId, documentReady, lockOwnerId, ready]);

  useEffect(() => {
    if (!ready || (!hydrationDocument && !isDirty) || !documentReady || (isDirty && hydrated))
      return;
    if (hydrated && hydrationVersion.current === version) return;
    let current = true;
    hydrating.current = true;
    void useDocumentStore
      .getState()
      .onEditorInit(ready.editor)
      .then(() => {
        if (!current) return;
        hydrationVersion.current = version;
        lastPublishedJSON.current = JSON.stringify(ready.editor.getDocument('json'));
        setHydrated(true);
        callbacks.current.onInit?.(ready.editor);
      })
      .finally(() => {
        if (current) hydrating.current = false;
      });
    return () => {
      current = false;
    };
  }, [hydrationDocument, documentReady, hydrated, isDirty, ready, version]);

  useEffect(() => {
    if (!ready || !canWrite) return;
    return bindNativePageRuntime({
      runtime,
      editor: ready.editor,
      commands: ready.commands,
      documentId,
      getTitle: () => callbacks.current.getTitle(),
      setTitle: (title) => callbacks.current.setTitle(title),
    });
  }, [canWrite, documentId, ready, runtime]);

  const save = useCallback(
    async (saveSource: 'manual' | 'system') => {
      if (!ready || !hydrated) return false;
      const state = useDocumentStore.getState();
      if (state.editor !== ready.editor || state.activeDocumentId !== documentId) return false;
      await callbacks.current.beforeSave?.();
      await state.commitEditorMutation(documentId, { saveSource });
      const doc = useDocumentStore.getState().documents[documentId];
      const saved = !!doc && !doc.isDirty && !doc.saveBlockedByLock;
      if (saved && saveSource === 'manual') callbacks.current.onSave?.();
      return saved;
    },
    [documentId, hydrated, ready],
  );
  useRegisterFilesHotkeys();
  useSaveDocumentHotkey(async () => {
    await save('manual');
  });

  return (
    <>
      {header}
      <UnsavedChangesGuard
        isDirty={isDirty || metadataDirty}
        message={t('form.unsavedWarning', { ns: 'ui' })}
        onAutoSave={() => save('system')}
      />
      {error && (
        <AsyncError
          error={error}
          variant="inline"
          onRetry={() => {
            void mutate();
          }}
        />
      )}
      {missingWithEdits && (
        <p className="text-sm text-muted-foreground" role="status">
          {t('nativeDocument.unavailableWithEdits', { ns: 'editor' })}
        </p>
      )}
      {data === null && !missingWithEdits ? (
        <NotFound />
      ) : (
        <>
          {!hydrated && <ArticleSkeleton rows={8} />}
          <div aria-disabled={disabled} inert={disabled}>
            <NativePageEditor
              {...surface}
              content=""
              debounceWait={0}
              editable={canWrite}
              type="markdown"
              onReady={(editor, commands) => {
                setReady({ editor, commands });
              }}
              onTextChange={(editor) => {
                if (!canWrite || hydrating.current) return;
                const state = useDocumentStore.getState();
                if (state.editor !== editor || state.activeDocumentId !== documentId) return;
                const json = JSON.stringify(editor.getDocument('json'));
                if (json === lastPublishedJSON.current) return;
                lastPublishedJSON.current = json;
                state.handleContentChange();
                callbacks.current.onContentChange?.();
              }}
            />
          </div>
        </>
      )}
      {footer}
    </>
  );
}
