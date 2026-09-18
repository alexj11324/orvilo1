import { createModal, type ModalInstance } from '@lobehub/ui/base-ui';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateAgentModal, openCreateAgentModal } from './useCreateModal';

const analyticsTrack = vi.hoisted(() => vi.fn());
const telemetryState = vi.hoisted(() => ({ enabled: true }));
const chatInputState = vi.hoisted(() => {
  interface Editor {
    focus: () => void;
    instance: {
      setDocument: (format: string, content: string) => void;
    };
  }

  interface State {
    editor: Editor;
    onMarkdownContentChange?: (content: string) => void;
    onSend?: () => void;
  }

  const state: State = {
    editor: {
      focus: vi.fn(),
      instance: {
        setDocument: vi.fn((_format: string, content: string) => {
          state.onMarkdownContentChange?.(content);
        }),
      },
    },
  };

  return state;
});

vi.mock('@/libs/analytics/client', () => ({
  analyticsClient: { track: analyticsTrack },
}));

vi.mock('@lobehub/ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Button: ({
    children,
    disabled,
    loading,
    onClick,
    type,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    loading?: boolean;
    onClick?: () => void;
    type?: string;
  }) => (
    <button
      data-button-loading={loading ? 'true' : undefined}
      data-button-type={type}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  ),
}));

vi.mock('@lobehub/ui/base-ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Button: ({
    children,
    disabled,
    loading,
    onClick,
    type,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    loading?: boolean;
    onClick?: () => void;
    type?: string;
  }) => (
    <button
      data-button-loading={loading ? 'true' : undefined}
      data-button-type={type}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  ),
  createModal: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: (namespace: string) => ({
    t: (key: string) =>
      (
        ({
          'chat:createModal.createBlank': 'Start Blank',
          'chat:createModal.groupPlaceholder': 'Describe what this Group should do...',
          'chat:createModal.groupTitle': 'What should this Group do?',
          'chat:createModal.placeholder': 'Describe what this Agent should do...',
          'chat:createModal.title': 'What should this Agent do?',
          'common:home.suggestQuestions': 'Try these examples',
          'common:switch': 'Switch',
          'suggestQuestions:example.prompt': 'Use this example prompt',
          'suggestQuestions:example.title': 'Example title',
        }) as Record<string, string>
      )[`${namespace}:${key}`] ?? key,
  }),
}));

vi.mock('@/features/ChatInput', () => ({
  ChatInputProvider: ({
    children,
    chatInputEditorRef,
    onMarkdownContentChange,
    onSend,
  }: {
    children?: ReactNode;
    chatInputEditorRef?: (editor: typeof chatInputState.editor) => void;
    onMarkdownContentChange?: (content: string) => void;
    onSend?: () => void;
  }) => {
    chatInputState.onMarkdownContentChange = onMarkdownContentChange;
    chatInputState.onSend = onSend;
    chatInputEditorRef?.(chatInputState.editor);

    return <div>{children}</div>;
  },
  DesktopChatInput: ({ placeholder }: { placeholder?: string }) => (
    <div>
      <textarea
        aria-label="chat input"
        placeholder={placeholder}
        onChange={(event) => {
          chatInputState.onMarkdownContentChange?.(event.currentTarget.value);
        }}
      />
      <button
        type="button"
        onClick={() => {
          chatInputState.onSend?.();
        }}
      >
        Send
      </button>
    </div>
  ),
}));

vi.mock('@/features/Home/SuggestQuestions/useRandomQuestions', () => ({
  useRandomQuestions: () => ({
    questions: [
      {
        id: 'example-1',
        promptKey: 'example.prompt',
        titleKey: 'example.title',
      },
    ],
    refresh: vi.fn(),
  }),
}));

vi.mock('@/store/user', () => ({
  getUserStoreState: () => ({ telemetry: telemetryState.enabled }),
}));

vi.mock('@/store/user/selectors', () => ({
  userGeneralSettingsSelectors: {
    telemetry: (state: { telemetry: boolean }) => state.telemetry,
  },
}));

const renderModal = (type: 'agent' | 'group' = 'agent') => {
  const onClose = vi.fn();
  const onCreateBlank = vi.fn().mockResolvedValue(undefined);
  const onSubmit = vi.fn().mockResolvedValue(undefined);

  render(
    <CreateAgentModal
      agentId="inbox-agent"
      type={type}
      onClose={onClose}
      onCreateBlank={onCreateBlank}
      onSubmit={onSubmit}
    />,
  );

  return { onClose, onCreateBlank, onSubmit };
};

describe('CreateAgentModal analytics', () => {
  beforeEach(() => {
    analyticsTrack.mockReset();
    telemetryState.enabled = true;
    chatInputState.onMarkdownContentChange = undefined;
    chatInputState.onSend = undefined;
    vi.mocked(chatInputState.editor.focus).mockClear();
    vi.mocked(chatInputState.editor.instance.setDocument).mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('tracks manual submit source after successful agent creation submit', async () => {
    const { onSubmit } = renderModal();

    fireEvent.change(screen.getByLabelText('chat input'), {
      target: { value: 'Create a research assistant' },
    });
    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('Create a research assistant');
    });
    await waitFor(() => {
      expect(analyticsTrack).toHaveBeenCalledWith({
        name: 'create_agent_modal_creation_succeeded',
        properties: {
          source: 'manual',
          spm: 'home.create_agent_modal.submit',
          type: 'agent',
        },
      });
    });
  });

  it('tracks example submit source when the user submits an example unchanged', async () => {
    const { onSubmit } = renderModal();

    fireEvent.click(screen.getByText('Example title'));
    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('Use this example prompt');
    });
    await waitFor(() => {
      expect(analyticsTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: expect.objectContaining({ source: 'example' }),
        }),
      );
    });
  });

  it('tracks example_edited when an example is changed before submit', async () => {
    renderModal();

    fireEvent.click(screen.getByText('Example title'));
    fireEvent.change(screen.getByLabelText('chat input'), {
      target: { value: 'Edited example prompt' },
    });
    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(analyticsTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: expect.objectContaining({ source: 'example_edited' }),
        }),
      );
    });
  });

  it('tracks blank source when Start Blank succeeds', async () => {
    const { onCreateBlank } = renderModal();

    fireEvent.click(screen.getByText('Start Blank'));

    await waitFor(() => {
      expect(onCreateBlank).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(analyticsTrack).toHaveBeenCalledWith({
        name: 'create_agent_modal_creation_succeeded',
        properties: {
          source: 'blank',
          spm: 'home.create_agent_modal.submit',
          type: 'agent',
        },
      });
    });
  });

  it('does not track when telemetry is disabled', async () => {
    telemetryState.enabled = false;
    const { onSubmit } = renderModal();

    fireEvent.change(screen.getByLabelText('chat input'), {
      target: { value: 'Create a research assistant' },
    });
    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(analyticsTrack).not.toHaveBeenCalled();
  });

  it('does not track group submits through the create agent event', async () => {
    const { onSubmit } = renderModal('group');

    fireEvent.change(screen.getByLabelText('chat input'), {
      target: { value: 'Create a research group' },
    });
    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(analyticsTrack).not.toHaveBeenCalled();
  });
});

describe('openCreateAgentModal', () => {
  it('reports the close through onOpenChangeComplete, not onOpenChange', () => {
    // Regression: the in-content close and the post-create path both call the
    // instance's `close()`, which never fires `onOpenChange`. Wiring the
    // provider's `createModalOpen` reset to that callback left it stuck true,
    // after which the dialog could not be opened a second time.
    vi.mocked(createModal).mockClear();
    vi.mocked(createModal).mockReturnValue({
      close: vi.fn(),
      destroy: vi.fn(),
      setCanDismissByClickOutside: vi.fn(),
      update: vi.fn(),
    } as unknown as ModalInstance);

    const onClosed = vi.fn();
    openCreateAgentModal({
      onClosed,
      onCreateBlank: vi.fn(),
      onSubmit: vi.fn(),
      type: 'agent',
    });

    const props = vi.mocked(createModal).mock.calls.at(-1)![0] as Record<string, any>;
    expect(props.onOpenChange).toBeUndefined();
    expect(typeof props.onOpenChangeComplete).toBe('function');

    props.onOpenChangeComplete(true);
    expect(onClosed).not.toHaveBeenCalled();

    props.onOpenChangeComplete(false);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });
});
