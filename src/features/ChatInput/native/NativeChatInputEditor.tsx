'use client';

import type { NativeIEditorKernel } from '@orvilo/editor-runtime/native-browser';
import { $getSelection, $isRangeSelection } from 'lexical';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { getFileListFromDataTransferItems } from '@/components/DragUploadZone/useLocalDragUpload';
import type { NativeMathRenderer } from '@/components/NativePageEditor/math';
import { NativeMathWidget } from '@/components/NativePageEditor/math';
import type { NativeEditorWidgets } from '@/components/NativePageEditor/session';
import { useEnterToSend } from '@/hooks/useEnterToSend';

import { getDraftEntry, removeDraftIfUnchanged, saveDraft } from '../draftStorage';
import InputHistoryPopup, { getHistoryPreviewText } from '../InputEditor/InputHistoryPopup';
import type { ChatInputHistoryScope } from '../inputHistoryStorage';
import { NativeChatMenus } from './ChatMenus';
import { nativeChatEmbedPlugins } from './embedPlugins';
import { NativeChatSurface } from './NativeChatSurface';
import { useNativeInputHistory } from './useNativeInputHistory';

export interface NativeChatInputEditorProps {
  /** Mandatory business bindings; never cast this backend to the SDK IEditor. */
  bindEditor: (editor: NativeIEditorKernel) => () => void;
  children?:
    | ReactNode
    | ((actions: { send: () => void; stop: () => void; editor: NativeIEditorKernel }) => ReactNode);
  className?: string;
  /** Real immutable conversation key; key this host on context change. */
  draftKey: string;
  editable: boolean;
  expanded: boolean;
  historyEnabled: boolean;
  historyScope: ChatInputHistoryScope;
  initialContent?: string;
  label: string;
  mathRenderer: NativeMathRenderer;
  mentionEnabled: boolean;
  onContextMenu: (event: MouseEvent, editor: NativeIEditorKernel) => void | Promise<void>;
  onMarkdownChange: (markdown: string) => void;
  onSend: (editor: NativeIEditorKernel) => void;
  onStop: (editor: NativeIEditorKernel) => void;
  placeholder: ReactNode;
  popupContainer: HTMLElement | null;
  resolveSendBlocked: () => boolean;
  /** Existing fullscreen handoff snapshot; takes priority over durable draft. */
  savedEditorData?: Record<string, unknown>;
  slashEnabled: boolean;
  style?: CSSProperties;
  /** Existing chat attachment uploader, not the document's file insertion API. */
  uploadFiles: (files: File[]) => void | Promise<void>;
  widgets: Omit<NativeEditorWidgets, 'math'>;
}

function jsonRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Explicit native chat surface. Existing production InputEditor remains intact.
 * Sending never implicitly clears content: the real business clear/restore
 * transaction must decide when a send actually committed. */
export function NativeChatInputEditor(props: NativeChatInputEditorProps) {
  return <NativeChatSession key={props.draftKey} {...props} />;
}

function NativeChatSession(props: NativeChatInputEditorProps) {
  const { t } = useTranslation('editor');
  const current = useRef(props);
  current.current = props;
  const [editor, setEditor] = useState<NativeIEditorKernel>();
  const composing = useRef(false);
  const releaseBinding = useRef<(() => void) | undefined>(undefined);
  const menuKeys = useRef<((event: KeyboardEvent) => boolean) | undefined>(undefined);
  const bindMenuKeys = useCallback((handler: ((event: KeyboardEvent) => boolean) | undefined) => {
    menuKeys.current = handler;
  }, []);
  const shouldSendOnEnter = useEnterToSend();
  const [plugins] = useState(() => nativeChatEmbedPlugins(t));
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loadedRevision = useRef<number | undefined>(undefined);
  const getMarkdown = () => String(editor?.getDocument('markdown') ?? '').trimEnd();
  const history = useNativeInputHistory({
    editor,
    enabled: props.historyEnabled,
    getMarkdownContent: getMarkdown,
    isComposingRef: composing,
    scope: props.historyScope,
  });
  const historyCurrent = useRef(history);
  historyCurrent.current = history;
  const persist = useCallback(
    (kernel: NativeIEditorKernel, removeEmpty: boolean) => {
      if (!kernel.getLexicalEditor()) return;
      let markdown: string;
      let json: unknown;
      try {
        markdown = String(kernel.getDocument('markdown') ?? '');
        json = kernel.getDocument('json');
      } catch {
        return;
      } // A detached editor must never erase a durable draft.
      if (!markdown.trim()) {
        if (removeEmpty && removeDraftIfUnchanged(props.draftKey, loadedRevision.current))
          loadedRevision.current = undefined;
        return;
      }
      if (jsonRecord(json)) {
        const revision = saveDraft(props.draftKey, json);
        if (revision !== undefined) loadedRevision.current = revision;
      }
    },
    [props.draftKey],
  );
  function flush(removeEmpty = true) {
    clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    if (editor) persist(editor, removeEmpty);
  }
  useEffect(() => {
    if (!editor) return;
    releaseBinding.current = current.current.bindEditor(editor);
    current.current.onMarkdownChange(String(editor.getDocument('markdown') ?? '').trimEnd());
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (saveTimer.current !== undefined) persist(editor, true);
      clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
      persist(editor, false);
      if (!editor.isEmpty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      const pending = saveTimer.current !== undefined;
      clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
      if (pending) persist(editor, true);
      persist(editor, false);
      releaseBinding.current?.();
      releaseBinding.current = undefined;
    };
  }, [editor, persist]);

  return (
    <div
      onCompositionEndCapture={() => {
        composing.current = false;
      }}
      onCompositionStartCapture={() => {
        composing.current = true;
      }}
      onContextMenu={(event) => {
        const root = editor?.getRootElement();
        if (editor && root?.contains(event.target as Node)) {
          void current.current.onContextMenu(event.nativeEvent, editor);
        }
      }}
      onKeyDownCapture={(event) => {
        if (!editor || !editor.isEditable()) return;
        const root = editor.getRootElement();
        if (!root?.contains(event.target as Node)) return;
        // Formula/code sub-editors own their own shortcuts, never send their Enter.
        if (
          event.target instanceof HTMLElement &&
          event.target.closest('textarea,input,.cm-editor,[data-native-code-editor]')
        )
          return;
        const native = event.nativeEvent;
        if (native.isComposing || composing.current || native.keyCode === 229) return;
        if (menuKeys.current?.(native) || historyCurrent.current.handleKeyDown(native)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (native.key !== 'Enter' || native.shiftKey) return;
        const send = current.current.expanded
          ? native.metaKey || native.ctrlKey
          : shouldSendOnEnter(native);
        if (send) {
          event.preventDefault();
          event.stopPropagation();
          if (!current.current.resolveSendBlocked()) {
            flush();
            current.current.onSend(editor);
          }
        }
      }}
      onPasteCapture={(event) => {
        if (!editor || !editor.isEditable()) return;
        const root = editor.getRootElement();
        if (!root?.contains(event.target as Node)) return;
        if (
          event.target instanceof HTMLElement &&
          event.target.closest('textarea,input,.cm-editor,[data-native-code-editor]')
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        const items = Array.from(event.clipboardData.items);
        const text = event.clipboardData.getData('text/plain');
        if (items.some((item) => item.kind === 'file')) {
          void getFileListFromDataTransferItems(items).then((files) => {
            if (editor.getLexicalEditor()?.isEditable() && files.length) {
              void current.current.uploadFiles(files);
            }
          });
        } else {
          editor.getLexicalEditor()?.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) selection.insertRawText(text);
          });
        }
      }}
    >
      <InputHistoryPopup
        activeIndex={history.popup.activeIndex}
        container={props.popupContainer}
        entries={history.popup.entries}
        open={history.popup.open}
        onClose={history.close}
        onHover={history.setActiveIndex}
        onSelect={history.confirm}
      />
      <NativeChatSurface
        autoFocus
        className={props.className}
        content={props.initialContent ?? ''}
        editable={props.editable}
        label={props.label}
        plugins={plugins}
        style={props.style}
        type="text"
        placeholder={
          history.ghostMarkdown === undefined
            ? props.placeholder
            : getHistoryPreviewText(history.ghostMarkdown)
        }
        widgets={{
          ...props.widgets,
          math: (widget) => <NativeMathWidget {...widget} renderer={props.mathRenderer} />,
        }}
        onBlur={() => flush()}
        onReady={(kernel) => {
          const draft = getDraftEntry(props.draftKey);
          loadedRevision.current = draft?.updatedAt;
          if (props.savedEditorData) kernel.setDocument('json', props.savedEditorData);
          else if (draft && kernel.isEmpty) kernel.setDocument('json', draft.json);
          setEditor(kernel);
        }}
        onTextChange={(kernel) => {
          current.current.onMarkdownChange(String(kernel.getDocument('markdown') ?? '').trimEnd());
          historyCurrent.current.handleEditorChange();
          clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => persist(kernel, true), 500);
        }}
      >
        {editor ? (
          <NativeChatMenus
            bindKeys={bindMenuKeys}
            container={props.popupContainer}
            kernel={editor}
            mentionEnabled={props.mentionEnabled}
            slashEnabled={props.slashEnabled}
          />
        ) : null}
        {editor && typeof props.children === 'function'
          ? props.children({
              editor,
              send: () => {
                if (editor.isEditable() && !current.current.resolveSendBlocked()) {
                  flush();
                  current.current.onSend(editor);
                }
              },
              stop: () => current.current.onStop(editor),
            })
          : typeof props.children !== 'function'
            ? props.children
            : null}
      </NativeChatSurface>
    </div>
  );
}
