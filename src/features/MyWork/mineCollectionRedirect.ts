export const resolveMineCollectionRedirect = (params: {
  agentId?: string;
  collection: string | null;
  projectId?: string;
  scope: string | null;
}): string | null => {
  if (params.agentId || params.projectId) return null;
  if (params.collection !== 'mine') return null;
  if (params.scope === 'assigned') return '/my-work?tab=assigned';
  if (params.scope === 'created') return '/my-work?tab=created';
  return null;
};
