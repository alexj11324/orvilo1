/**
 * Bind the generic issue composer to one team's Triage queue. TaskModel.create
 * classifies a newly created team-owned issue as `untriaged`; the callback
 * refreshes that same queue after the durable create succeeds.
 */
export const teamTriageCreateOptions = (teamId: string, onCreated: () => void) => ({
  onCreated,
  teamId,
});
