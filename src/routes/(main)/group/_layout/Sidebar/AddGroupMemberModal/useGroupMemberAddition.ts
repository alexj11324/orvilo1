import { useEffect, useState } from 'react';
import useSWR from 'swr';

import { groupKeys } from '@/libs/swr/keys';
import { agentService } from '@/services/agent';

export const useGroupMemberAddition = (
  open: boolean,
  onConfirm: (ids: string[]) => void | Promise<void>,
) => {
  const {
    data: agents = [],
    error: loadError,
    isLoading,
    mutate,
  } = useSWR(open ? groupKeys.queryAgents() : null, () => agentService.queryAgents());
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<unknown>();
  useEffect(() => {
    if (!open) setAddError(undefined);
  }, [open]);
  const submit = async (ids: string[]) => {
    setIsAdding(true);
    setAddError(undefined);
    try {
      await onConfirm(ids);
      return true;
    } catch (error) {
      console.error('Failed to add members:', error);
      setAddError(error);
      return false;
    } finally {
      setIsAdding(false);
    }
  };
  return { agents, loadError, isLoading, mutate, isAdding, addError, submit };
};
