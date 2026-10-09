import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import InputEditor from './index';

const permission = vi.hoisted(() => ({
  allowed: false,
}));

const platform = vi.hoisted(() => ({
  isMobile: false,
}));

type StoreSelector<T = unknown> = (state: Record<PropertyKey, unknown>) => T;

const getEditorStyle = async () => {
  const { Editor } = await import('@lobehub/editor/react');
  const props = vi.mocked(Editor).mock.lastCall?.[0] as
    { style?: { fontSize?: number } } | undefined;

  expect(props).toBeDefined();

  return props!.style;
};

vi.mock('@orvilo/const', () => ({
  isDesktop: false,
}));
vi.mock('@orvilo/const/hotkeys', () => ({
  HotkeyEnum: { AddUserMessage: 'add-user-message' },
  KeyEnum: { Alt: 'alt', Enter: 'enter' },
}));
vi.mock('@orvilo/heterogeneous-agents', () => ({ HETEROGENEOUS_TYPE_LABELS: {} }));
vi.mock('@orvilo/utils', () => ({
  isRecord: (value: unknown): value is Record<PropertyKey, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value),
  isCommandPressed: vi.fn(() => false),
  merge: vi.fn((...args) => Object.assign({}, ...args)),
}));
vi.mock('@lobehub/editor', () => ({
  INSERT_MENTION_COMMAND: 'insert-mention',
  ReactMathPlugin: vi.fn(),
}));
vi.mock('@lobehub/editor/react', () => {
  const Editor = Object.assign(
    vi.fn(({ content, editable }: { content?: string; editable?: boolean }) => (
      <div data-content={content} data-editable={String(editable)} data-testid="mock-editor" />
    )),
    {
      withProps: vi.fn((plugin, props) => [plugin, props]),
    },
  );

  return {
    Editor,
    useEditorState: vi.fn(() => ({ isEmpty: true })),
  };
});
vi.mock('@lobehub/ui', () => ({ combineKeys: vi.fn(() => 'alt+enter') }));
vi.mock('fuse.js', () => ({
  default: class Fuse {
    search() {
      return [];
    }
  },
}));
vi.mock('react-hotkeys-hook', () => ({
  useHotkeysContext: () => ({
    disableScope: vi.fn(),
    enableScope: vi.fn(),
  }),
}));

vi.mock('@/components/DragUploadZone', () => ({
  usePasteFile: vi.fn(),
  useUploadFiles: () => ({ handleUploadFiles: vi.fn() }),
}));
vi.mock('@/hooks/useEnterToSend', () => ({ useEnterToSend: () => vi.fn(() => false) }));
vi.mock('@/hooks/useIMECompositionEvent', () => ({
  useIMECompositionEvent: () => ({
    compositionProps: {
      onCompositionEnd: vi.fn(),
      onCompositionStart: vi.fn(),
    },
    isComposingRef: { current: false },
  }),
}));
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ allowed: permission.allowed, reason: '' }),
}));
vi.mock('@/store/chat', () => ({
  useChatStore: Object.assign(<T,>(selector: StoreSelector<T>) => selector({}), {
    getState: () => ({ activeTopicId: undefined }),
  }),
}));
vi.mock('@/store/serverConfig', () => ({
  useServerConfigStore: <T,>(selector: StoreSelector<T>) =>
    selector({ isMobile: platform.isMobile }),
}));
vi.mock('../hooks/useChatInputDraft', () => ({
  useChatInputDraft: () => ({ restoreDraft: vi.fn(), saveDraftDebounced: vi.fn() }),
}));
vi.mock('../hooks/useChatInputResourceAccess', () => ({
  useChatInputResourceAccess: () => ({ canUseResource: true, isGroupContext: false }),
}));
vi.mock('@/store/agent', () => ({
  useAgentStore: <T,>(selector: StoreSelector<T>) => selector({}),
}));
vi.mock('@/store/agent/selectors', () => ({
  agentByIdSelectors: {
    getAgencyConfigById: () => () => undefined,
    getAgentModelById: () => () => undefined,
    getAgentModelProviderById: () => () => undefined,
  },
}));
vi.mock('@/store/user', () => {
  const useUserStore = Object.assign(<T,>(selector: StoreSelector<T>) => selector({}), {
    getState: () => ({}),
  });

  return { useUserStore };
});
vi.mock('@/store/user/selectors', () => ({
  labPreferSelectors: { enableInputMarkdown: () => false },
  settingsSelectors: { getHotkeyById: () => () => 'alt+enter' },
  userProfileSelectors: { userId: () => 'user-id' },
}));

vi.mock('../hooks/useAgentId', () => ({ useAgentId: () => 'agent-id' }));
vi.mock('../store', () => {
  const editor = {
    dispatchCommand: vi.fn(),
  };
  const state = {
    disableMention: true,
    disableSlash: true,
    editor,
    expand: false,
    handleSendButton: vi.fn(),
    slashMenuRef: { current: null },
    slashPlacement: 'top',
    updateMarkdownContent: vi.fn(),
  };

  return {
    useChatInputStore: <T,>(selector: StoreSelector<T>) => selector(state),
    useStoreApi: () => ({
      getState: () => ({}),
      subscribe: vi.fn(() => vi.fn()),
    }),
  };
});
vi.mock('./ActionTag', () => ({
  INSERT_ACTION_TAG_COMMAND: 'insert-action-tag',
  useSlashActionItems: () => [],
}));
vi.mock('./MentionMenu', () => ({ createMentionMenu: vi.fn(() => vi.fn(() => null)) }));
vi.mock('./Placeholder', () => ({
  default: () => <span>placeholder</span>,
}));
vi.mock('./plugins', () => ({
  CHAT_INPUT_EMBED_PLUGINS: [],
  createChatInputRichPlugins: () => [],
}));
vi.mock('./ReferTopic', () => ({ INSERT_REFER_TOPIC_COMMAND: 'insert-refer-topic' }));
vi.mock('./LocalFileTag', () => ({
  INSERT_LOCAL_FILE_TAG_COMMAND: 'insert-local-file-tag',
}));
vi.mock('./useLocalFileTag', () => ({
  useLocalFileTag: () => ({
    enableLocalFileTag: false,
    searchLocalFiles: vi.fn(async () => []),
  }),
}));
vi.mock('./useMentionCategories', () => ({ useMentionCategories: () => [] }));

describe('ChatInput InputEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permission.allowed = false;
    platform.isMobile = false;
  });

  it('renders as read-only when create-content permission is denied', () => {
    render(<InputEditor />);

    expect(screen.getByTestId('mock-editor')).toHaveAttribute('data-editable', 'false');
  });

  it('initializes the editor with content captured by a fallback input', () => {
    render(<InputEditor initialContent="typed before the editor loaded" />);

    expect(screen.getByTestId('mock-editor')).toHaveAttribute(
      'data-content',
      'typed before the editor loaded',
    );
  });

  it('renders the editor at 16px on mobile', async () => {
    permission.allowed = true;
    platform.isMobile = true;

    render(<InputEditor />);

    expect((await getEditorStyle())?.fontSize).toBe(16);
  });

  it('keeps the editor font size unchanged on desktop', async () => {
    permission.allowed = true;

    render(<InputEditor />);

    expect((await getEditorStyle())?.fontSize).toBeUndefined();
  });
});
