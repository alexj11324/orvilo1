import type { DocumentItem } from '@orvilo/database/schemas';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkspaceContextStore } from '@/business/client/workspaceContextStore';
import { documentService } from '@/services/document';
import { useDocumentStore } from '@/store/document';
import type { DocumentEditorPort } from '@/store/document/types';
import { usePageStore } from '@/store/page';

import { useNativeDocumentResource } from './useNativeDocumentResource';

// The global setup normally wraps real Zustand factories to reset stores. This
// integration test uses the original factory and explicitly resets real stores.
vi.unmock('zustand/traditional');

const documentId = 'native-resource-race';
const initialText = '# Initial server document';
const localText = '# Local edit made while the request was pending';
const initialTimestamp = new Date('2026-10-15T10:00:00.000Z');
const savedTimestamp = new Date('2026-10-15T10:05:00.000Z');

const editorJSON = (text: string) => ({
  root: {
    children: [{ children: [{ text, type: 'text' }], type: 'paragraph' }],
    type: 'root',
  },
});

function createEditor() {
  let text = initialText;
  return {
    getDocument(format: string): unknown {
      return format === 'markdown' ? text : format === 'json' ? editorJSON(text) : undefined;
    },
    setDocument(format: string, content: string) {
      if (format !== 'markdown') throw new Error('This fixture writes Markdown only');
      text = content;
    },
  } satisfies DocumentEditorPort;
}

function remoteDocument(): DocumentItem {
  return {
    accessedAt: initialTimestamp,
    clientId: null,
    content: initialText,
    createdAt: initialTimestamp,
    deletedAt: null,
    description: null,
    editorData: editorJSON(initialText),
    fileId: null,
    filename: null,
    fileType: 'custom/document',
    id: documentId,
    isDeleted: null,
    knowledgeBaseId: null,
    metadata: null,
    pages: null,
    parentId: null,
    slug: null,
    source: 'native-resource-test',
    sourceType: 'api',
    teamId: null,
    title: 'Native resource race',
    totalCharCount: initialText.length,
    totalLineCount: 1,
    updatedAt: initialTimestamp,
    userId: 'native-resource-user',
    visibility: 'private',
    workspaceId: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function wrapper() {
  const cache = new Map();
  return ({ children }: PropsWithChildren) =>
    createElement(
      SWRConfig,
      {
        value: {
          provider: () => cache,
          dedupingInterval: 0,
          revalidateOnFocus: false,
          revalidateOnReconnect: false,
          shouldRetryOnError: false,
        },
      },
      children,
    );
}

function initializeCleanDocument(editor: DocumentEditorPort) {
  useDocumentStore.getState().initDocumentWithEditor({
    autoSave: false,
    content: initialText,
    documentId,
    editor,
    editorData: editorJSON(initialText),
    sourceType: 'page',
  });
}

beforeEach(() => {
  useDocumentStore.setState(useDocumentStore.getInitialState(), true);
  usePageStore.setState(usePageStore.getInitialState(), true);
  useWorkspaceContextStore.getState().setActiveWorkspace(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useDocumentStore.setState(useDocumentStore.getInitialState(), true);
  usePageStore.setState(usePageStore.getInitialState(), true);
});

describe('useNativeDocumentResource with real SWR and DocumentStore', () => {
  it('keeps local edits when a request started clean and resolves after the document becomes dirty', async () => {
    const request = deferred<DocumentItem>();
    const getDocument = vi
      .spyOn(documentService, 'getDocumentById')
      .mockImplementation(() => request.promise);
    const editor = createEditor();
    initializeCleanDocument(editor);
    const { result } = renderHook(() => useNativeDocumentResource(documentId, editor, false), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(getDocument).toHaveBeenCalledWith(documentId));
    expect(useDocumentStore.getState().documents[documentId].isDirty).toBe(false);
    act(() => {
      editor.setDocument('markdown', localText);
      useDocumentStore.getState().handleContentChange();
    });
    expect(useDocumentStore.getState().documents[documentId].isDirty).toBe(true);

    const response = remoteDocument();
    await act(async () => {
      request.resolve(response);
      await request.promise;
    });
    await waitFor(() => {
      expect(result.current.data).toEqual(response);
      expect(result.current.isValidating).toBe(false);
    });

    const state = useDocumentStore.getState();
    expect(state.documents[documentId]).toMatchObject({
      content: localText,
      editorData: editorJSON(localText),
      isDirty: true,
      lastSavedContent: initialText,
      lastSavedEditorData: editorJSON(initialText),
    });
    expect(state.editor).toBe(editor);
    expect(editor.getDocument('markdown')).toBe(localText);
  });

  it('keeps a newer successful local save when an older in-flight response arrives after the document is clean again', async () => {
    const request = deferred<DocumentItem>();
    const getDocument = vi
      .spyOn(documentService, 'getDocumentById')
      .mockImplementation(() => request.promise);
    const updateDocument = vi.spyOn(documentService, 'updateDocument').mockResolvedValue({
      historyAppended: false,
      id: documentId,
      savedAt: savedTimestamp.toISOString(),
    });
    const editor = createEditor();
    initializeCleanDocument(editor);
    const { result } = renderHook(() => useNativeDocumentResource(documentId, editor, false), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(getDocument).toHaveBeenCalledWith(documentId));

    act(() => {
      editor.setDocument('markdown', localText);
      useDocumentStore.getState().handleContentChange();
    });
    await act(async () => {
      await useDocumentStore.getState().commitEditorMutation(documentId, { saveSource: 'manual' });
    });
    expect(updateDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        content: localText,
        id: documentId,
        saveSource: 'manual',
      }),
    );
    expect(useDocumentStore.getState().documents[documentId]).toMatchObject({
      isDirty: false,
      lastUpdatedTime: savedTimestamp,
      lastSavedContent: localText,
    });

    const response = remoteDocument();
    await act(async () => {
      request.resolve(response);
      await request.promise;
    });
    await waitFor(() => {
      expect(result.current.data).toEqual(response);
      expect(result.current.isValidating).toBe(false);
    });

    expect(useDocumentStore.getState().documents[documentId]).toMatchObject({
      content: localText,
      editorData: editorJSON(localText),
      isDirty: false,
      lastSavedContent: localText,
      lastSavedEditorData: editorJSON(localText),
      lastUpdatedTime: savedTimestamp,
    });
    expect(result.current.hydrationDocument).toBeUndefined();
    expect(editor.getDocument('markdown')).toBe(localText);
  });

  it('retains dirty local content and editor ownership when the delayed service reports the document missing', async () => {
    const request = deferred<DocumentItem | undefined>();
    const getDocument = vi
      .spyOn(documentService, 'getDocumentById')
      .mockImplementation(() => request.promise);
    const editor = createEditor();
    initializeCleanDocument(editor);
    const { result } = renderHook(() => useNativeDocumentResource(documentId, editor, false), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(getDocument).toHaveBeenCalledWith(documentId));

    act(() => {
      editor.setDocument('markdown', localText);
      useDocumentStore.getState().handleContentChange();
    });
    // The real service declaration represents a missing document as undefined.
    // Native resource ingress must normalize it to the host's null contract.
    await act(async () => {
      request.resolve(undefined);
      await request.promise;
    });
    await waitFor(() => {
      expect(result.current.data).toBeNull();
      expect(result.current.isValidating).toBe(false);
    });

    const state = useDocumentStore.getState();
    expect(state.activeDocumentId).toBe(documentId);
    expect(state.editor).toBe(editor);
    expect(state.documents[documentId]).toMatchObject({
      content: localText,
      editorData: editorJSON(localText),
      isDirty: true,
      lastSavedContent: initialText,
    });
    expect(editor.getDocument('markdown')).toBe(localText);
  });
});
