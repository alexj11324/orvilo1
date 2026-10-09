import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentModalProvider, useAgentModal } from './ModalProvider';

const mocks = vi.hoisted(() => ({
  closeCreateAgentModal: vi.fn(),
  createAgentModalProps: undefined as
    | {
        onCreateBlank: () => Promise<void> | void;
        type: 'agent' | 'group';
      }
    | undefined,
  sendAsGroup: vi.fn(),
}));

vi.mock('@/components/ChatGroupWizard', () => ({
  ChatGroupWizard: ({ open }: { open: boolean }) =>
    open ? <div>Deferred group wizard</div> : null,
}));

vi.mock('@/components/MemberSelectionModal', () => ({
  MemberSelectionModal: ({ open }: { open: boolean }) =>
    open ? <div>Deferred member selection</div> : null,
}));

vi.mock('@/features/CreatePlatformAgent', () => ({
  default: () => null,
}));

vi.mock('@/features/EditingPopover', () => ({
  default: () => null,
}));

vi.mock('@/features/HomeSidebar/hooks/useCreateModal', () => ({
  openCreateAgentModal: (props: { onCreateBlank: () => Promise<void> | void }) => {
    mocks.createAgentModalProps = props as typeof mocks.createAgentModalProps;
    return { close: mocks.closeCreateAgentModal };
  },
}));

vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (state: { inboxAgentId: string }) => unknown) =>
    selector({ inboxAgentId: 'inbox-agent' }),
}));

vi.mock('@/store/agent/selectors', () => ({
  builtinAgentSelectors: {
    inboxAgentId: (state: { inboxAgentId: string }) => state.inboxAgentId,
  },
}));

vi.mock('@/store/home', () => ({
  useHomeStore: (selector: (state: { sendAsGroup: typeof mocks.sendAsGroup }) => unknown) =>
    selector({
      sendAsGroup: mocks.sendAsGroup,
    }),
}));

vi.mock('./Modals/ConfigGroupModal', () => ({
  default: () => null,
}));

vi.mock('./Modals/CreateGroupModal', () => ({
  openCreateGroupModal: vi.fn(),
}));

const OpenCreateAgentModalButton = () => {
  const { openGroupWizardModal, openMemberSelectionModal } = useAgentModal();

  return (
    <>
      <button type="button" onClick={() => openGroupWizardModal({})}>
        Open group wizard
      </button>
      <button type="button" onClick={() => openMemberSelectionModal({})}>
        Open member selection
      </button>
    </>
  );
};

const renderProvider = () =>
  render(
    <AgentModalProvider>
      <OpenCreateAgentModalButton />
    </AgentModalProvider>,
  );

describe('AgentModalProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAgentModalProps = undefined;
    mocks.sendAsGroup.mockResolvedValue('group-id');
  });

  afterEach(() => {
    cleanup();
  });

  it('loads deferred selection modals when their interactions request them', async () => {
    renderProvider();

    expect(screen.queryByText('Deferred group wizard')).not.toBeInTheDocument();
    expect(screen.queryByText('Deferred member selection')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Open group wizard'));
    expect(await screen.findByText('Deferred group wizard')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Open member selection'));
    expect(await screen.findByText('Deferred member selection')).toBeInTheDocument();
  });
});
