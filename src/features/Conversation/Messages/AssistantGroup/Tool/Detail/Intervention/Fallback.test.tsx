/**
 * @vitest-environment happy-dom
 */
import type { BuiltinInterventionProps } from '@orvilo/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ToolDetail from '../index';
import type ApprovalActionsType from './ApprovalActions';
import FallbackIntervention from './Fallback';
import Intervention from './index';

const {
  approveToolCall,
  rejectAndContinueToolCall,
  stopPendingApprovalForCard,
  submitHeteroIntervention,
  access,
} = vi.hoisted(() => ({
  access: { canUseResource: true },
  approveToolCall: vi.fn(),
  rejectAndContinueToolCall: vi.fn(),
  stopPendingApprovalForCard: vi.fn(),
  submitHeteroIntervention: vi.fn(),
}));

const metaMap: Record<string, { avatar?: string; title?: string }> = {
  'calculator': { title: 'Calculator' },
  'orvilo-activator': { avatar: '🛠', title: 'Tools & Skills Activator' },
  'search': { title: 'Web Search' },
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number; defaultValue?: string }) =>
      (
        ({
          'builtins.orvilo-activator.apiName.activateTools': 'Activate Tools',
          'builtins.orvilo-activator.title': 'Tools & Skills Activator',
          'edit': 'Edit',
        }) as Record<string, string>
      )[key] ||
      (key === 'tool.intervention.viewParameters'
        ? `View parameters (${options?.count ?? 0})`
        : options?.defaultValue || key),
  }),
}));

vi.mock('@orvilo/builtin-tools/streamings', () => ({ getBuiltinStreaming: () => undefined }));
vi.mock('@/components/ai-elements/tool', () => ({
  ToolOutput: ({ output, errorText }: { output: unknown; errorText?: string }) => (
    <div>
      {errorText}
      {JSON.stringify(output)}
    </div>
  ),
  ToolInput: ({ input }: { input: unknown }) => (
    <pre data-testid="tool-input">{JSON.stringify(input)}</pre>
  ),
}));

vi.mock('@orvilo/builtin-tools/interventions', () => ({
  getBuiltinIntervention: (identifier?: string, apiName?: string) => {
    if (identifier !== 'devin' || apiName !== 'askUserQuestion') return;

    return ({ onInteractionAction }: BuiltinInterventionProps) => (
      <button
        data-testid="devin-permission-option"
        type="button"
        onClick={() =>
          void onInteractionAction?.({
            payload: { 'Allow Devin to continue?': 'allow-once' },
            type: 'submit',
          })
        }
      >
        Allow once
      </button>
    );
  },
}));

vi.mock('../../../../../hooks/useConversationResourceAccess', () => ({
  useConversationResourceAccess: () => access,
}));

vi.mock('@/store/tool/selectors', () => ({
  toolSelectors: {
    getMetaById: (id: string) => () => metaMap[id],
  },
}));

vi.mock('@/store/tool', () => ({
  pluginHelpers: {
    getPluginTitle: (meta?: { title?: string }) => meta?.title,
  },
  useToolStore: (selector: (state: unknown) => unknown) => selector({}),
}));

vi.mock('@/store/user', () => ({
  useUserStore: (selector: (state: unknown) => unknown) => selector({}),
}));

vi.mock('@/store/user/selectors', () => ({
  toolInterventionSelectors: {
    approvalMode: () => 'manual',
  },
}));

vi.mock('../../../../../store', () => ({
  dataSelectors: {
    getDbMessageById: () => () => undefined,
    pendingInterventions: () => [{ toolCallId: 'call-1', assistantGroupId: 'real-turn-owner' }],
  },
  useConversationStore: (
    selector: (state: {
      approveToolCall: typeof approveToolCall;
      rejectAndContinueToolCall: typeof rejectAndContinueToolCall;
      stopPendingApprovalForCard: typeof stopPendingApprovalForCard;
      cancelToolInteraction: ReturnType<typeof vi.fn>;
      skipToolInteraction: ReturnType<typeof vi.fn>;
      submitHeteroIntervention: typeof submitHeteroIntervention;
      submitToolInteraction: ReturnType<typeof vi.fn>;
      updatePluginArguments: ReturnType<typeof vi.fn>;
    }) => unknown,
  ) =>
    selector({
      approveToolCall,
      rejectAndContinueToolCall,
      stopPendingApprovalForCard,
      cancelToolInteraction: vi.fn(),
      skipToolInteraction: vi.fn(),
      submitHeteroIntervention,
      submitToolInteraction: vi.fn(),
      updatePluginArguments: vi.fn(),
    }),
}));

vi.mock('../Arguments', () => ({
  default: ({ arguments: args }: { arguments?: string }) => <pre>{args}</pre>,
}));

vi.mock('./ApprovalActions', () => ({
  default: ({
    children,
    assistantGroupId,
  }: {
    children?: ReactNode;
    assistantGroupId?: string;
  }) => (
    <div data-owner={assistantGroupId} data-testid="approval-actions">
      approval-actions{children}
    </div>
  ),
}));

vi.mock('./KeyValueEditor', () => ({
  default: () => <div>editor</div>,
}));

describe('FallbackIntervention', () => {
  it('shows requested tool names for activateTools interventions', () => {
    render(
      <FallbackIntervention
        apiName="activateTools"
        assistantGroupId="assistant-group-1"
        id="message-1"
        identifier="orvilo-activator"
        requestArgs='{"identifiers":["search","calculator"]}'
        toolCallId="tool-call-1"
      />,
    );

    expect(
      screen.getByText('Tools & Skills Activator → Activate Tools (Web Search, Calculator)'),
    ).toBeInTheDocument();
  });

  it('shows the activation reason for activateTools interventions', () => {
    const reason = 'I need orvilo-agent tools to create and manage the requested task list.';

    render(
      <FallbackIntervention
        apiName="activateTools"
        assistantGroupId="assistant-group-1"
        id="message-1"
        identifier="orvilo-activator"
        requestArgs={JSON.stringify({ identifiers: ['search'], reason })}
        toolCallId="tool-call-1"
      />,
    );

    expect(screen.getByText(reason)).toBeInTheDocument();
  });

  it('renders URL avatars as images instead of visible text', () => {
    const iconUrl = 'https://example.com/icon.png';
    metaMap.search.avatar = iconUrl;

    render(
      <FallbackIntervention
        apiName="search"
        assistantGroupId="assistant-group-1"
        id="message-1"
        identifier="search"
        requestArgs="{}"
        toolCallId="tool-call-1"
      />,
    );

    expect(screen.queryByText(iconUrl)).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Web Search' })).toHaveAttribute('src', iconUrl);
  });
});

describe('heterogeneous custom intervention', () => {
  it('routes a Devin permission option ID through submitHeteroIntervention', async () => {
    render(
      <Intervention
        apiName="askUserQuestion"
        id="message-devin-permission"
        identifier="devin"
        requestArgs='{"questions":[{"question":"Allow Devin to continue?","options":[{"id":"allow-once","label":"Allow once"}]}]}'
        toolCallId="devin-permission-1"
      />,
    );

    fireEvent.click(screen.getByTestId('devin-permission-option'));

    await waitFor(() => {
      expect(submitHeteroIntervention).toHaveBeenCalledWith('message-devin-permission', 'submit', {
        'Allow Devin to continue?': 'allow-once',
      });
    });
  });
});

describe('pending tool inline confirmation', () => {
  it('keeps parameters and binary approval in the tool and uses the real turn owner', () => {
    render(
      <ToolDetail
        apiName="runCommand"
        arguments='{"command":"printf fixture"}'
        identifier="orvilo-local-system"
        intervention={{ status: 'pending' }}
        messageId="content-block-not-turn"
        toolCallId="call-1"
        toolMessageId="persisted-tool-message"
      />,
    );
    expect(screen.getByTestId('tool-input')).toHaveTextContent('printf fixture');
    expect(screen.getByTestId('approval-actions')).toHaveAttribute('data-owner', 'real-turn-owner');
  });

  it('leaves custom question controls to the bottom interaction host', () => {
    const { container } = render(
      <ToolDetail
        apiName="askUserQuestion"
        arguments="{}"
        identifier="devin"
        intervention={{ status: 'pending' }}
        messageId="content-block"
        toolCallId="call-1"
        toolMessageId="persisted-tool-message"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('truthful tool approval outcomes', () => {
  it.each([
    ['approved', 'tool.intervention.approved'],
    ['rejected', 'tool.intervention.toolRejected'],
    ['aborted', 'tool.intervention.toolAbort'],
  ] as const)('renders the persisted %s outcome', (status, label) => {
    render(
      <ToolDetail
        apiName="runCommand"
        arguments="{}"
        identifier="orvilo-local-system"
        intervention={{ status }}
        messageId="block"
        result={{ id: 'tool-result', content: 'done' }}
        toolCallId="call-1"
        toolMessageId="tool-message"
      />,
    );
    expect(screen.getByText(label)).toBeInTheDocument();
    if (status !== 'approved')
      expect(screen.queryByText('tool.intervention.approved')).not.toBeInTheDocument();
    if (status === 'aborted')
      expect(screen.queryByText('tool.intervention.toolRejected')).not.toBeInTheDocument();
  });

  it('does not imply approval when a tool completed without a recorded decision', () => {
    render(
      <ToolDetail
        apiName="runCommand"
        arguments="{}"
        identifier="orvilo-local-system"
        messageId="block"
        result={{ id: 'tool-result', content: 'done' }}
        toolCallId="call-1"
      />,
    );
    expect(screen.queryByText('tool.intervention.approved')).not.toBeInTheDocument();
  });

  it('keeps skipped questions neutral rather than showing a rejected confirmation', () => {
    const { container } = render(
      <ToolDetail
        apiName="askUserQuestion"
        arguments="{}"
        identifier="devin"
        intervention={{ status: 'rejected', skipped: true }}
        messageId="block"
        toolCallId="call-1"
      />,
    );
    expect(screen.getByText('tool.intervention.questionSkipped')).toBeInTheDocument();
    expect(container.querySelector('[data-ai-element="confirmation"]')).not.toBeInTheDocument();
  });
});

describe('direct tool approval actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    access.canUseResource = true;
  });

  const mountActions = async (
    approvalMode: 'manual' | 'allow-list' = 'manual',
    messageId = 'tool-message-1',
  ) => {
    const { default: ApprovalActions } = await vi.importActual<{
      default: typeof ApprovalActionsType;
    }>('./ApprovalActions');
    const onBeforeApprove = vi.fn().mockResolvedValue({ command: 'edited' });
    render(
      <ApprovalActions
        apiName="runCommand"
        approvalMode={approvalMode}
        assistantGroupId="group-1"
        identifier="local-system"
        messageId={messageId}
        toolCallId="call-1"
        onBeforeApprove={onBeforeApprove}
      />,
    );
    return onBeforeApprove;
  };

  it('approves directly and flushes edited arguments without a separate Submit step', async () => {
    const beforeApprove = await mountActions();
    fireEvent.click(
      screen.getByRole('button', { name: 'tool.intervention.optionApprove', exact: true }),
    );
    await waitFor(() =>
      expect(approveToolCall).toHaveBeenCalledWith('tool-message-1', 'group-1', {
        editedArguments: { command: 'edited' },
      }),
    );
    expect(beforeApprove).toHaveBeenCalledOnce();
    expect(rejectAndContinueToolCall).not.toHaveBeenCalled();
  });

  it('rejects directly with a trimmed reason and never flushes executable arguments', async () => {
    const beforeApprove = await mountActions();
    fireEvent.click(screen.getByRole('button', { name: 'tool.intervention.details' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  use another command  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'tool.intervention.reject', exact: true }));
    await waitFor(() =>
      expect(rejectAndContinueToolCall).toHaveBeenCalledWith(
        'tool-message-1',
        'use another command',
      ),
    );
    expect(beforeApprove).not.toHaveBeenCalled();
    expect(approveToolCall).not.toHaveBeenCalled();
  });

  it('remembers permissions only for the explicit allow-list action', async () => {
    await mountActions('allow-list');
    fireEvent.click(screen.getByRole('button', { name: 'tool.intervention.details' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'tool.intervention.optionApproveRemember' }),
    );
    await waitFor(() =>
      expect(approveToolCall).toHaveBeenCalledWith('tool-message-1', 'group-1', {
        editedArguments: { command: 'edited' },
        rememberToolKey: 'local-system/runCommand',
      }),
    );
  });

  it('stops directly without approving or rejecting', async () => {
    await mountActions();
    fireEvent.click(screen.getByRole('button', { name: 'tool.intervention.details' }));
    fireEvent.click(screen.getByRole('button', { name: 'tool.intervention.stop' }));
    await waitFor(() => expect(stopPendingApprovalForCard).toHaveBeenCalledWith('tool-message-1'));
    expect(approveToolCall).not.toHaveBeenCalled();
    expect(rejectAndContinueToolCall).not.toHaveBeenCalled();
  });

  it('keeps the default confirmation compact with advanced controls behind disclosure', async () => {
    await mountActions('allow-list');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'tool.intervention.stop' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'tool.intervention.optionApproveRemember' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'tool.intervention.reject', exact: true }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'tool.intervention.optionApprove', exact: true }),
    ).toBeVisible();
  });

  it('opens the rejection details using the existing keyboard shortcut', async () => {
    await mountActions();
    fireEvent.keyDown(document.body, { key: '2' });
    const input = await screen.findByRole('textbox');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'keyboard reason' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(rejectAndContinueToolCall).toHaveBeenCalledWith('tool-message-1', 'keyboard reason'),
    );
    expect(approveToolCall).not.toHaveBeenCalled();
  });

  it('keeps operation details available but hides mutation actions for viewers', async () => {
    access.canUseResource = false;
    await mountActions();
    expect(screen.getByRole('button', { name: 'tool.intervention.details' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'tool.intervention.optionApprove', exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'tool.intervention.reject', exact: true }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(approveToolCall).not.toHaveBeenCalled();
  });

  it('blocks all approval actions for temporary messages', async () => {
    await mountActions('manual', 'tmp_pending');
    expect(
      screen.getByRole('button', { name: 'tool.intervention.optionApprove', exact: true }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'tool.intervention.reject', exact: true }),
    ).toBeDisabled();
    expect(approveToolCall).not.toHaveBeenCalled();
    expect(rejectAndContinueToolCall).not.toHaveBeenCalled();
    expect(stopPendingApprovalForCard).not.toHaveBeenCalled();
  });
});
