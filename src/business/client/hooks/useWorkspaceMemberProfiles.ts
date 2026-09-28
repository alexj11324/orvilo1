import { useMemo } from 'react';

import { useWorkspaceMembers } from './useWorkspaceMembers';

/**
 * userId → display profile for the members of the active workspace.
 *
 * A workspace topic already carries `userId` (its creator / triggerer); this
 * is the client-side lookup that turns that id into a face and a name. In
 * personal mode it is an empty map, so surfaces resolving an author degrade
 * to no author without extra branching.
 */
export interface WorkspaceMemberProfile {
  avatar?: string | null;
  fullName?: string | null;
  username?: string | null;
}

export const useWorkspaceMemberProfiles = (): ReadonlyMap<string, WorkspaceMemberProfile> => {
  const members = useWorkspaceMembers();
  return useMemo(() => {
    const map = new Map<string, WorkspaceMemberProfile>();
    for (const member of members) {
      map.set(member.userId, {
        avatar: member.user?.avatar,
        fullName: member.user?.fullName,
        username: member.user?.username,
      });
    }
    return map;
  }, [members]);
};
