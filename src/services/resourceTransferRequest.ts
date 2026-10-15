/**
 * What a handover will carry — shown to both parties so neither commits blind:
 * bot bindings and cron jobs transfer DISABLED, device bindings may reset,
 * other users' task assignments on a private agent detach.
 */
export interface TransferManifest {
  connectorsAffected: number;
  cronJobs: number;
  expertiseAffected: number;
  groupsToLeave: number;
  hiddenReferencedMember: boolean;
  knowledgeToDetach: number;
  ownerId: string;
  projectsToLeave: number;
  tasksToDetach: number;
}
