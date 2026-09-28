/**
 * SWR key registry for the teammates domain. `useClientDataSWR` and the
 * scoped `mutate` both append the active workspace id to concrete keys, so
 * these keys only need the domain + parameters — cache separation across
 * workspaces is automatic.
 */
export const teammatesKeys = {
  agents: () => ['teammates:agents'] as const,
  invitations: () => ['teammates:invitations'] as const,
  members: (includeDeleted?: boolean) =>
    ['teammates:members', { includeDeleted: !!includeDeleted }] as const,
  ownershipTransfer: () => ['teammates:ownershipTransfer'] as const,
  projectMembers: (projectId: string) => ['teammates:projectMembers', projectId] as const,
  removalPreview: (userId: string) => ['teammates:removalPreview', userId] as const,
} as const;
