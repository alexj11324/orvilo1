import { useRef, useState } from 'react';

import { chatGroupService } from '@/services/chatGroup';
import { useAgentGroupStore } from '@/store/agentGroup';
import { useHomeStore } from '@/store/home';

export const useGroupChatCreation = () => {
  const checkpoint = useRef<string | undefined>(undefined);
  const busy = useRef(false);
  const [createdId, setCreatedId] = useState<string>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();

  const create = async (
    params: Parameters<typeof chatGroupService.createGroup>[0],
    participantIds: string[],
  ) => {
    if (busy.current) return undefined;
    busy.current = true;
    setPending(true);
    setError(undefined);
    try {
      if (!checkpoint.current) {
        const { group } = await chatGroupService.createGroup(params);
        checkpoint.current = group.id;
        setCreatedId(group.id);
      }
      if (participantIds.length)
        await chatGroupService.addAgentsToGroup(checkpoint.current, participantIds);
      await useAgentGroupStore.getState().refreshGroupDetail(checkpoint.current);
      await useHomeStore.getState().refreshAgentList();
      return checkpoint.current;
    } catch (cause) {
      console.error('Failed to finish creating group chat:', cause);
      setError(cause);
      return undefined;
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return { create, createdId, error, pending };
};
