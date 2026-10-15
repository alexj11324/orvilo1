import { createHeadlessEditor } from '@orvilo/editor-runtime/headless';
import type { NativeIEditorKernel } from '@orvilo/editor-runtime/native-browser';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createElement, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { composerJSON } from '../composerProtocol';
import { getDraft, saveDraft } from '../draftStorage';
import { createStore } from '../store';
import { bindNativeComposer } from './bindNativeComposer';
import { NativeChatInputEditor, type NativeChatInputEditorProps } from './NativeChatInputEditor';
import type { NativePageEditorProps } from './NativeChatSurface';

const leaf = vi.hoisted(
  (): {
    kernel: NativeIEditorKernel | undefined;
    publish: (() => void) | undefined;
  } => ({ kernel: undefined, publish: undefined }),
);

// Only the DOM/widget mount leaf is replaced. The mounted chat owner retains
// its actual effects, timers, revision checks, history hook and draftStorage.
vi.mock('./NativeChatSurface', async () => {
  const { createElement, useEffect, useRef } = await import('react');
  const { nativeEditorRuntimeCommands } = await import('@orvilo/editor-runtime/native-browser');
  return {
    NativeChatSurface(props: NativePageEditorProps) {
      const latest = useRef(props);
      latest.current = props;
      const kernel = useRef(leaf.kernel).current;
      useEffect(() => {
        if (!kernel) throw new Error('Actual headless backend not provided');
        latest.current.onReady(kernel, nativeEditorRuntimeCommands);
        const publish = () => latest.current.onTextChange?.(kernel);
        leaf.publish = publish;
        return () => {
          if (leaf.publish === publish) leaf.publish = undefined;
        };
      }, [kernel]);
      useEffect(() => {
        kernel?.getLexicalEditor()?.setEditable(props.editable ?? true);
      }, [kernel, props.editable]);
      return createElement('div', { 'data-testid': 'surface-leaf' }, props.children);
    },
  };
});
vi.mock('./ChatMenus', () => ({ NativeChatMenus: () => null }));

const backends: ReturnType<typeof createHeadlessEditor>[] = [];
function backend(markdown = '') {
  const result = createHeadlessEditor();
  result.kernel.getLexicalEditor()?.setEditable(true);
  if (markdown) result.kernel.setDocument('markdown', markdown);
  else result.kernel.cleanDocument();
  backends.push(result);
  return result.kernel;
}
function document(kernel: NativeIEditorKernel) {
  const json = composerJSON(kernel.getDocument('json'));
  if (!json) throw new Error('Actual JSON datasource did not return a document');
  return json;
}
function publishClear(kernel: NativeIEditorKernel) {
  act(() => {
    kernel.cleanDocument();
    if (!leaf.publish) throw new Error('Mounted chat did not attach its real change callback');
    leaf.publish();
  });
}
function props(
  draftKey: string,
  store: ReturnType<typeof createStore>,
): NativeChatInputEditorProps {
  return {
    bindEditor: (kernel) => bindNativeComposer(store, kernel),
    draftKey,
    editable: true,
    expanded: false,
    historyEnabled: false,
    historyScope: {},
    label: 'Composer',
    mathRenderer: { render: vi.fn(), renderToString: vi.fn(() => '') },
    mentionEnabled: false,
    slashEnabled: false,
    placeholder: 'Message',
    popupContainer: null,
    resolveSendBlocked: () => false,
    onContextMenu: vi.fn(),
    onMarkdownChange: vi.fn(),
    onSend: vi.fn(),
    onStop: vi.fn(),
    uploadFiles: vi.fn(),
    widgets: {
      code: () => null,
      mention: () => null,
      linkCard: () => null,
      linkIframe: () => null,
      linkSchema: () => null,
    },
  };
}

describe('mounted native chat durable draft lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    leaf.kernel = undefined;
    leaf.publish = undefined;
  });
  afterEach(() => {
    cleanup();
    for (const editor of backends.splice(0)) editor.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('mirrors a restored durable draft before any new user edit', () => {
    const kernel = backend('Restored message');
    saveDraft('restored', document(kernel));
    kernel.cleanDocument();
    leaf.kernel = kernel;
    const store = createStore();
    const mirror = vi.fn();
    store.setState({ onMarkdownContentChange: mirror });
    const options = props('restored', store);
    options.onMarkdownChange = () => store.getState().updateMarkdownContent();
    render(createElement(NativeChatInputEditor, options));
    expect(mirror).toHaveBeenCalledWith('Restored message');
    expect(store.getState().markdownContent).toBe('Restored message');
  });

  it('flushes a pending empty deletion when unmounted before its 500ms save', () => {
    const kernel = backend('Saved draft');
    const before = document(kernel);
    saveDraft('topic_a', before);
    kernel.cleanDocument();
    leaf.kernel = kernel;
    const view = render(createElement(NativeChatInputEditor, props('topic_a', createStore())));
    expect(String(kernel.getDocument('markdown')).trim()).toBe('Saved draft');
    publishClear(kernel);
    act(() => vi.advanceTimersByTime(100));
    expect(getDraft('topic_a')).toEqual(before);
    view.unmount();
    expect(getDraft('topic_a')).toBeUndefined();
    act(() => vi.advanceTimersByTime(600));
    expect(getDraft('topic_a')).toBeUndefined();
  });

  it('flushes only the old key on context switch, then restores the actual next draft', () => {
    const first = backend('First');
    const firstJSON = document(first);
    const second = backend('Second');
    const secondJSON = document(second);
    saveDraft('topic_a', firstJSON);
    saveDraft('topic_b', secondJSON);
    first.cleanDocument();
    second.cleanDocument();
    const store = createStore();
    leaf.kernel = first;
    const view = render(createElement(NativeChatInputEditor, props('topic_a', store)));
    publishClear(first);
    act(() => vi.advanceTimersByTime(100));
    leaf.kernel = second;
    view.rerender(createElement(NativeChatInputEditor, props('topic_b', store)));
    expect(getDraft('topic_a')).toBeUndefined();
    expect(getDraft('topic_b')).toEqual(secondJSON);
    expect(String(second.getDocument('markdown')).trim()).toBe('Second');
    expect(store.getState().nativeComposer).toBe(second);
    act(() => vi.advanceTimersByTime(600));
    expect(getDraft('topic_a')).toBeUndefined();
    expect(getDraft('topic_b')).toEqual(secondJSON);
  });

  it('does not delete another writer revision when the cleared owner exits', () => {
    const first = backend('Loaded');
    const newer = backend('Another writer');
    saveDraft('shared', document(first));
    const newerJSON = document(newer);
    leaf.kernel = first;
    const view = render(createElement(NativeChatInputEditor, props('shared', createStore())));
    publishClear(first);
    saveDraft('shared', newerJSON);
    view.unmount();
    expect(getDraft('shared')).toEqual(newerJSON);
  });

  it('flushes an empty pending draft at beforeunload without resurrecting it on cleanup', () => {
    const kernel = backend('Saved');
    saveDraft('topic_a', document(kernel));
    leaf.kernel = kernel;
    const view = render(createElement(NativeChatInputEditor, props('topic_a', createStore())));
    publishClear(kernel);
    act(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true })));
    expect(getDraft('topic_a')).toBeUndefined();
    view.unmount();
    expect(getDraft('topic_a')).toBeUndefined();
  });

  it('rebinds in StrictMode and an old disposer cannot clear a newer actual kernel', () => {
    const first = backend('First');
    const second = backend('New owner');
    const store = createStore();
    leaf.kernel = first;
    const view = render(
      createElement(StrictMode, null, createElement(NativeChatInputEditor, props('strict', store))),
    );
    expect(store.getState().nativeComposer).toBe(first);
    const releaseNew = bindNativeComposer(store, second);
    view.unmount();
    expect(store.getState().nativeComposer).toBe(second);
    releaseNew();
    expect(store.getState().nativeComposer).toBeUndefined();
  });

  it('does not send through its rendered action after actual readonly transition', () => {
    const kernel = backend('Kept draft');
    leaf.kernel = kernel;
    const options = props('readonly', createStore());
    const view = render(
      createElement(NativeChatInputEditor, {
        ...options,
        children: ({ send }) => createElement('button', { onClick: send }, 'Send'),
      }),
    );
    act(() => kernel.getLexicalEditor()?.setEditable(false));
    fireEvent.click(view.getByRole('button', { name: 'Send' }));
    expect(options.onSend).not.toHaveBeenCalled();
    expect(String(kernel.getDocument('markdown')).trim()).toBe('Kept draft');
  });
});
