'use client';

import {
  createContext,
  lazy,
  memo,
  type ReactNode,
  Suspense,
  use,
  useMemo,
  useRef,
  useState,
} from 'react';

import { type ModalInstance } from '@/components/Modal';
import EditingPopover from '@/features/EditingPopover';
import { openLabelFormModal } from '@/features/WorkspaceSetting/Labels/LabelFormModal';

import ConfigGroupModal from './Modals/ConfigGroupModal';
import { openCreateGroupModal } from './Modals/CreateGroupModal';

const ChatGroupWizard = lazy(() =>
  import('@/components/ChatGroupWizard').then((module) => ({
    default: module.ChatGroupWizard,
  })),
);

const MemberSelectionModal = lazy(() =>
  import('@/components/MemberSelectionModal').then((module) => ({
    default: module.MemberSelectionModal,
  })),
);

interface AgentModalContextValue {
  closeAllModals: () => void;
  closeConfigGroupModal: () => void;
  closeCreateGroupModal: () => void;
  closeGroupWizardModal: () => void;
  closeMemberSelectionModal: () => void;
  openConfigGroupModal: (scope?: 'private' | 'public') => void;
  openCreateGroupModal: (sessionId?: string, visibility?: 'private' | 'public') => void;
  /**
   * Create an agent label from anywhere in the list (e.g. the Labels
   * submenu). When `assignTo` is given, the new label is applied to that
   * agent right after creation.
   */
  openCreateLabelModal: (assignTo?: { agentId: string; currentLabelIds: string[] }) => void;
  openGroupWizardModal: (callbacks: GroupWizardCallbacks) => void;
  openMemberSelectionModal: (callbacks: MemberSelectionCallbacks) => void;
  setGroupWizardLoading: (loading: boolean) => void;
}

interface GroupWizardCallbacks {
  onCancel?: () => void;
  onCreateCustom?: (selectedAgents: string[]) => Promise<void>;
  onCreateFromTemplate?: (templateId: string, selectedMemberTitles?: string[]) => Promise<void>;
}

interface MemberSelectionCallbacks {
  onCancel?: () => void;
  onConfirm?: (selectedAgents: string[]) => Promise<void>;
}

const AgentModalContext = createContext<AgentModalContextValue | null>(null);

export const useAgentModal = () => {
  const context = use(AgentModalContext);
  if (!context) {
    throw new Error('useAgentModal must be used within AgentModalProvider');
  }
  return context;
};

export const useOptionalAgentModal = () => {
  return use(AgentModalContext);
};

interface AgentModalProviderProps {
  children: ReactNode;
}

export const AgentModalProvider = memo<AgentModalProviderProps>(({ children }) => {
  const createGroupModalRef = useRef<ModalInstance>(undefined);

  // ConfigGroupModal state
  const [configGroupModalOpen, setConfigGroupModalOpen] = useState(false);
  const [configGroupModalScope, setConfigGroupModalScope] = useState<'private' | 'public'>(
    'public',
  );

  // GroupWizard state
  const [groupWizardOpen, setGroupWizardOpen] = useState(false);
  const [groupWizardCallbacks, setGroupWizardCallbacks] = useState<GroupWizardCallbacks>({});
  const [groupWizardLoading, setGroupWizardLoading] = useState(false);

  // MemberSelection state
  const [memberSelectionOpen, setMemberSelectionOpen] = useState(false);
  const [memberSelectionCallbacks, setMemberSelectionCallbacks] =
    useState<MemberSelectionCallbacks>({});

  const contextValue = useMemo<AgentModalContextValue>(
    () => ({
      closeAllModals: () => {
        createGroupModalRef.current?.close();
        setConfigGroupModalOpen(false);
        setGroupWizardOpen(false);
        setMemberSelectionOpen(false);
      },
      closeConfigGroupModal: () => setConfigGroupModalOpen(false),
      closeCreateGroupModal: () => createGroupModalRef.current?.close(),
      closeGroupWizardModal: () => setGroupWizardOpen(false),
      closeMemberSelectionModal: () => setMemberSelectionOpen(false),
      openConfigGroupModal: (scope?: 'private' | 'public') => {
        setConfigGroupModalScope(scope ?? 'public');
        setConfigGroupModalOpen(true);
      },
      openCreateGroupModal: (sessionId?: string, visibility?: 'private' | 'public') => {
        createGroupModalRef.current = openCreateGroupModal({ id: sessionId, visibility });
      },
      openCreateLabelModal: (assignTo?: { agentId: string; currentLabelIds: string[] }) => {
        openLabelFormModal({ assignTo });
      },
      openGroupWizardModal: (callbacks: GroupWizardCallbacks) => {
        setGroupWizardCallbacks(callbacks);
        setGroupWizardOpen(true);
      },
      openMemberSelectionModal: (callbacks: MemberSelectionCallbacks) => {
        setMemberSelectionCallbacks(callbacks);
        setMemberSelectionOpen(true);
      },
      setGroupWizardLoading,
    }),
    [],
  );

  return (
    <AgentModalContext value={contextValue}>
      {children}

      <ConfigGroupModal
        open={configGroupModalOpen}
        scope={configGroupModalScope}
        onCancel={() => setConfigGroupModalOpen(false)}
      />

      {groupWizardOpen && (
        <Suspense fallback={null}>
          <ChatGroupWizard
            open
            isCreatingFromTemplate={groupWizardLoading}
            onCancel={() => {
              groupWizardCallbacks.onCancel?.();
              setGroupWizardOpen(false);
            }}
            onCreateCustom={async (selectedAgents: string[]) => {
              await groupWizardCallbacks.onCreateCustom?.(selectedAgents);
            }}
            onCreateFromTemplate={async (templateId: string, selectedMemberTitles?: string[]) => {
              await groupWizardCallbacks.onCreateFromTemplate?.(templateId, selectedMemberTitles);
            }}
          />
        </Suspense>
      )}

      {memberSelectionOpen && (
        <Suspense fallback={null}>
          <MemberSelectionModal
            open
            mode="create"
            onCancel={() => {
              memberSelectionCallbacks.onCancel?.();
              setMemberSelectionOpen(false);
            }}
            onConfirm={async (selectedAgents: string[]) => {
              await memberSelectionCallbacks.onConfirm?.(selectedAgents);
            }}
          />
        </Suspense>
      )}

      <EditingPopover />
    </AgentModalContext>
  );
});
