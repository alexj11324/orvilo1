import type { EditorRuntimeCommandBindings, EditorRuntimePort } from '@orvilo/editor-runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bindNativePageRuntime, type NativePageRuntimePort } from './runtimeBinding';

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  subscribe: vi.fn(() => () => {}),
  enqueueEditorSnapshot: vi.fn(),
  flush: vi.fn(),
  meaningful: vi.fn(),
}));
vi.mock('@/store/document', () => ({
  useDocumentStore: { getState: mocks.getState, subscribe: mocks.subscribe },
}));
vi.mock('@/services/documentHistoryQueue', () => ({ documentHistoryQueueService: mocks }));
vi.mock('@/libs/editor/hasMeaningfulEditorContent', () => ({
  hasMeaningfulEditorContent: mocks.meaningful,
}));

function fixture() {
  const runtime = {
    setEditor: vi.fn<NativePageRuntimePort['setEditor']>(),
    setCurrentDocId: vi.fn<NativePageRuntimePort['setCurrentDocId']>(),
    setTitleHandlers: vi.fn<NativePageRuntimePort['setTitleHandlers']>(),
    setBeforeMutateHandler: vi.fn<NativePageRuntimePort['setBeforeMutateHandler']>(),
    setAfterMutateHandler: vi.fn<NativePageRuntimePort['setAfterMutateHandler']>(),
  } satisfies NativePageRuntimePort;
  const editor = {
    getDocument: vi.fn(() => ({ root: { children: [] } })),
    setDocument: vi.fn(),
    getLexicalEditor: vi.fn(() => null),
    dispatchCommand: vi.fn(() => false),
  } satisfies EditorRuntimePort;
  const commands = {
    apply: {},
    modify: {},
    modifyWithResults: {},
  } satisfies EditorRuntimeCommandBindings;
  const commitEditorMutation = vi.fn(async () => {});
  const state = {
    editor,
    activeDocumentId: 'doc',
    documents: { doc: { lockOwnerId: 'lease' } },
    commitEditorMutation,
  };
  mocks.getState.mockReturnValue(state);
  const setTitle = vi.fn();
  const dispose = bindNativePageRuntime({
    runtime,
    editor,
    commands,
    documentId: 'doc',
    getTitle: () => 'Title',
    setTitle,
  });
  return { runtime, editor, commands, state, setTitle, dispose, commitEditorMutation };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.meaningful.mockReturnValue(true);
});
describe('native page Runtime host binding', () => {
  it('binds native commands and persists mutation history using the actual lease', async () => {
    const { runtime, editor, commands, commitEditorMutation, dispose } = fixture();
    expect(runtime.setEditor).toHaveBeenCalledWith(editor, commands);
    const before = runtime.setBeforeMutateHandler.mock.calls[0][0];
    const after = runtime.setAfterMutateHandler.mock.calls[0][0];
    await before?.({ apiName: 'modifyNodes' });
    await after?.();
    expect(mocks.enqueueEditorSnapshot).toHaveBeenCalledWith({
      documentId: 'doc',
      editor,
      lockOwnerId: 'lease',
    });
    expect(commitEditorMutation).toHaveBeenCalledWith('doc', { saveSource: 'llm_call' });
    dispose();
    expect(runtime.setEditor).toHaveBeenLastCalledWith(null);
    expect(runtime.setAfterMutateHandler).toHaveBeenLastCalledWith(null);
  });
  it('rejects stale mutation and title handlers after another document takes ownership', async () => {
    const { runtime, state, setTitle, commitEditorMutation } = fixture();
    state.activeDocumentId = 'another-doc';
    const before = runtime.setBeforeMutateHandler.mock.calls[0][0];
    const title = runtime.setTitleHandlers.mock.calls[0][0];
    expect(() => before?.({ apiName: 'modifyNodes' })).toThrow('no longer owns');
    expect(() => title?.('Changed')).toThrow('no longer owns');
    expect(setTitle).not.toHaveBeenCalled();
    expect(commitEditorMutation).not.toHaveBeenCalled();
    expect(mocks.enqueueEditorSnapshot).not.toHaveBeenCalled();
  });
});
