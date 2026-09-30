import type { ItemType } from '@/components/Menu';

interface AgentGroupTransferMeta {
  avatar?: string | null;
  backgroundColor?: string | null;
  description?: string | null;
  memberAvatars?: { avatar?: string; background?: string }[];
  title?: string | null;
}

export const useAgentGroupTransferMenuItem = (
  _groupId?: string,
  _providedGroupMeta?: AgentGroupTransferMeta,
): ItemType[] | null => null;
