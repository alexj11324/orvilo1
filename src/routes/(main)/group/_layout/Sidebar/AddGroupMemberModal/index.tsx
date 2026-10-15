'use client';

import { cn } from 'cn';
import { memo, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import ImperativeModal from '@/components/ImperativeModal';
import { Separator } from '@/components/ui/separator';

import { type AgentItemData } from './AgentItem';
import AvailableAgentList from './AvailableAgentList';
import SelectedAgentList from './SelectedAgentList';
import { useAgentSelectionStore } from './store';
import { useGroupMemberAddition } from './useGroupMemberAddition';

const styles = {
  container: 'flex flex-row h-125 p-3 border border-divider rounded-(--radius-card)',
  rightColumn: 'flex flex-1 flex-col',
};

export interface AddGroupMemberModalProps {
  existingMembers?: string[];
  groupId: string;
  onCancel: () => void;
  onConfirm: (selectedAgents: string[]) => void | Promise<void>;
  open: boolean;
}

const AddGroupMemberModal = memo<AddGroupMemberModalProps>(
  ({ existingMembers = [], onCancel, onConfirm, open }) => {
    const { t } = useTranslation(['chat', 'common']);

    const selectedAgentIds = useAgentSelectionStore((s) => s.selectedAgentIds);
    const clearSelection = useAgentSelectionStore((s) => s.clearSelection);

    // Fetch agents from the new API (non-virtual agents only)
    const {
      agents: allAgents,
      isLoading: isLoadingAgents,
      loadError,
      mutate,
      isAdding,
      addError,
      submit,
    } = useGroupMemberAddition(open, onConfirm);

    // Filter out existing members
    const availableAgents = useMemo<AgentItemData[]>(() => {
      return allAgents.filter((agent) => !existingMembers.includes(agent.id));
    }, [allAgents, existingMembers]);

    // Clear selection when modal closes
    useEffect(() => {
      if (!open) {
        clearSelection();
      }
    }, [open, clearSelection]);

    const handleConfirm = async () => {
      if (await submit(selectedAgentIds)) clearSelection();
    };

    const handleCancel = () => {
      clearSelection();
      onCancel();
    };

    const isConfirmDisabled =
      selectedAgentIds.length === 0 || isAdding || !!loadError || isLoadingAgents;

    return (
      <ImperativeModal
        allowFullscreen
        okButtonProps={{ disabled: isConfirmDisabled, loading: isAdding }}
        okText={`${t('memberSelection.addMember')} (${selectedAgentIds.length})`}
        open={open}
        title={t('memberSelection.addMember')}
        width={800}
        onCancel={handleCancel}
        onOk={handleConfirm}
      >
        <div className={cn('flex gap-2', styles.container)}>
          {/* Left Column - Available Agents */}
          {loadError ? (
            <AsyncError
              error={loadError}
              retrying={isLoadingAgents}
              onRetry={() => void mutate()}
            />
          ) : (
            <AvailableAgentList agents={availableAgents} isLoading={isLoadingAgents} />
          )}

          <Separator className="h-full" orientation={'vertical'} />

          {/* Right Column - Selected Agents */}
          <SelectedAgentList agents={allAgents} />
        </div>
        {addError !== undefined && (
          <AsyncError
            error={addError}
            retrying={isAdding}
            variant="inline"
            onRetry={() => void handleConfirm()}
          />
        )}
      </ImperativeModal>
    );
  },
);

export default AddGroupMemberModal;
