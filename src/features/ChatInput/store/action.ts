import { type StateCreator } from 'zustand/vanilla';

import { useAgentStore } from '@/store/agent';
import { getFileStoreState } from '@/store/file/store';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { removeDraft, saveDraft } from '../draftStorage';
import { canSerialize, readDocument, writeDocument } from '../editorDocument';
import { addInputHistory } from '../inputHistoryStorage';
import { type PublicState, type State } from './initialState';
import { initialState } from './initialState';

export interface Action {
  getJSONState: () => Record<string, any> | undefined;
  getMarkdownContent: () => string;
  handleSendButton: () => void;
  handleStop: () => void;
  setActiveAudioInputMode: (mode?: State['activeAudioInputMode']) => void;
  setDocument: (type: string, content: any, options?: Record<string, unknown>) => void;
  setExpand: (expend: boolean) => void;
  setJSONState: (content: any) => void;
  setShowTypoBar: (show: boolean) => void;
  updateMarkdownContent: () => void;
}

export type Store = Action & State;

type CreateStore = (
  initState?: Partial<PublicState>,
) => StateCreator<Store, [['zustand/devtools', never]]>;

const getEffectiveAgentId = (agentId?: string): string => {
  // Example: a ChatInput without an agentId prop reads history from activeAgentId,
  // so sending must write history to the same scope.
  return agentId !== undefined ? agentId : useAgentStore.getState().activeAgentId || '';
};

export const store: CreateStore = (publicState) => (set, get) => ({
  ...initialState,
  ...publicState,
  leftActions: publicState?.leftActions ?? initialState.leftActions,
  rightActions: publicState?.rightActions ?? initialState.rightActions,

  getJSONState: () => {
    return readDocument(get().editor, 'json') as Record<string, any> | undefined;
  },
  getMarkdownContent: () => {
    return String(readDocument(get().editor, 'markdown') || '').trimEnd();
  },
  handleSendButton: () => {
    const editor = get().editor;
    if (!editor) return;

    const { resolveSendBlocked, sendButtonProps } = get();
    if (resolveSendBlocked ? resolveSendBlocked() : sendButtonProps?.disabled) return;

    const onSend = get().onSend;
    const historyEnabled = !!onSend && (get().feature?.inputHistory ?? true);
    const historySnapshot = historyEnabled
      ? {
          agentId: getEffectiveAgentId(get().agentId),
          json: get().getJSONState(),
          markdown: get().getMarkdownContent(),
          userId: userProfileSelectors.userId(useUserStore.getState()),
        }
      : undefined;

    // Tie the draft's fate to the composer actually being cleared: a host may
    // decline the send after the fact (a rejected scheduled send keeps the text
    // on screen), and the key is captured here because committing the send can
    // move the conversation to a freshly created topic.
    const sentDraftKey = get().draftKey;
    const contextSelectionKey = get().contextSelectionKey;
    let clearedDraft:
      | {
          json: Record<string, any> | undefined;
          files: ReturnType<typeof getFileStoreState>['chatUploadFileList'];
          selections: ReturnType<
            typeof getFileStoreState
          >['chatContextSelectionsByContext'][string];
        }
      | undefined;

    onSend?.({
      clearContent: () => {
        const fileStore = getFileStoreState();
        clearedDraft ??= {
          json: get().getJSONState(),
          files: fileStore.chatUploadFileList,
          selections: contextSelectionKey
            ? (fileStore.chatContextSelectionsByContext[contextSelectionKey] ?? [])
            : [],
        };
        editor?.cleanDocument();
        if (sentDraftKey) removeDraft(sentDraftKey);
      },
      editor: editor!,
      getEditorData: get().getJSONState,
      getMarkdownContent: get().getMarkdownContent,
      restoreDraft: () => {
        // Preflight can reject before a message/operation exists. The snapshot
        // belongs to this composer; never put it into a newer conversation.
        if (
          !clearedDraft ||
          get().editor !== editor ||
          get().draftKey !== sentDraftKey ||
          get().contextSelectionKey !== contextSelectionKey
        )
          return;

        if (canSerialize(editor) && !get().getMarkdownContent().trim() && clearedDraft.json) {
          writeDocument(editor, 'json', clearedDraft.json);
          if (sentDraftKey) saveDraft(sentDraftKey, clearedDraft.json);
        }
        // Keep uploads and selections added while the failed preflight awaited.
        const fileStore = getFileStoreState();
        const currentIds = new Set(fileStore.chatUploadFileList.map((file) => file.id));
        fileStore.dispatchChatUploadFileList({
          files: clearedDraft.files.filter((file) => !currentIds.has(file.id)),
          type: 'addFiles',
        });
        if (contextSelectionKey) {
          const currentSelections =
            fileStore.chatContextSelectionsByContext[contextSelectionKey] ?? [];
          const selectionIds = new Set(currentSelections.map((selection) => selection.id));
          fileStore.restoreChatContextSelections(
            contextSelectionKey,
            clearedDraft.selections.filter((selection) => !selectionIds.has(selection.id)),
          );
        }
      },
    });

    if (historySnapshot) {
      addInputHistory(historySnapshot);
    }

    if (get().expand) {
      set({ _savedEditorState: undefined, expand: false });
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        editor.focus();
      });
    });
  },

  handleStop: () => {
    if (!get().editor) return;

    get().sendButtonProps?.onStop?.({ editor: get().editor! });
  },

  setActiveAudioInputMode: (activeAudioInputMode) => {
    set({ activeAudioInputMode });
  },

  setDocument: (type, content, options) => {
    writeDocument(get().editor, type, content, options);
  },

  setExpand: (expand) => {
    const editor = get().editor;
    const _savedEditorState = readDocument(editor, 'json') as Record<string, any> | undefined;
    set({ _savedEditorState, expand });
  },

  setJSONState: (content) => {
    writeDocument(get().editor, 'json', content);
  },

  setShowTypoBar: (showTypoBar) => {
    set({ showTypoBar });
  },

  updateMarkdownContent: () => {
    if (!get().onMarkdownContentChange) return;

    const content = get().getMarkdownContent();

    if (content === get().markdownContent) return;

    get().onMarkdownContentChange?.(content);

    set({ markdownContent: content });
  },
});
