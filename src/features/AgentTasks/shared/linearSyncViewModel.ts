import type {
  LinearInstallationRecoveryState,
  LinearInstallationStatus,
  LinearIssueLinkSyncState,
  LinearIssueSnapshot,
  LinearProjectBindingSettings,
  LinearSyncConflict,
  LinearSyncRecoveryRow,
} from '@orvilo/types';

export const LINEAR_SYNC_STATES: LinearIssueLinkSyncState[] = [
  'synced',
  'pending',
  'conflict',
  'outcome_unknown',
  'removed',
  'unlinked',
];

export type LinearIssueLinkView = {
  conflict?: LinearSyncConflict | null;
  id: string;
  lastConfirmedSnapshot: LinearIssueSnapshot;
  linearIdentifier: string;
  remoteSnapshot?: LinearIssueSnapshot | null;
  syncState: LinearIssueLinkSyncState;
  taskId: string;
};

export type LinearInstallationView = {
  id: string;
  lastError: string | null;
  lastSyncAt: Date | string | null;
  organizationId: string;
  organizationName: string | null;
  status: LinearInstallationStatus;
};

export type LinearRecoveryRowView = LinearSyncRecoveryRow;
export type LinearInstallationRecoveryView = LinearInstallationRecoveryState;

export const getLinearRecoverySummary = (rows: LinearRecoveryRowView[]) => ({
  deadLetter: rows.filter((row) => row.status === 'dead_letter').length,
  failed: rows.filter((row) => row.status === 'failed').length,
  outcomeUnknown: rows.filter((row) => row.status === 'outcome_unknown').length,
  total: rows.length,
});

export type LinearBindingView = {
  autoExecutionEnabled: boolean;
  defaultTeamId: string | null;
  id: string;
  importCompletedAt: Date | string | null;
  importCursor: string | null;
  installationId: string;
  linearProjectId: string;
  projectId: string;
  replanningEnabled: boolean;
  settings: LinearProjectBindingSettings;
  syncEnabled: boolean;
  teamIds: string[];
  version: number;
};

export const getLinearBindingRollout = (
  binding: Pick<LinearBindingView, 'settings' | 'syncEnabled'>,
) => ({
  readEnabled: binding.settings.readEnabled ?? binding.syncEnabled,
  writeEnabled: binding.settings.writeEnabled ?? binding.syncEnabled,
});

export type LinearInstallationTone = 'danger' | 'success' | 'warning';

export const getInstallationTone = (status: LinearInstallationStatus): LinearInstallationTone => {
  switch (status) {
    case 'active': {
      return 'success';
    }
    case 'paused': {
      return 'warning';
    }
    case 'error':
    case 'revoked': {
      return 'danger';
    }
  }
};

export const isCatalogOrganization = (
  organizations: Array<{ id: string }>,
  organizationId: string,
) => organizations.some((organization) => organization.id === organizationId);

export const getScopedProjects = <T extends { teamIds: string[] }>(
  projects: T[],
  teamId?: string,
) => (teamId ? projects.filter((project) => project.teamIds.includes(teamId)) : projects);

export type LinearImportSummary = {
  conflict: number;
  outcomeUnknown: number;
  pending: number;
  removed: number;
  synced: number;
  total: number;
};

export const summarizeIssueLinks = (links: LinearIssueLinkView[]): LinearImportSummary => {
  const summary: LinearImportSummary = {
    conflict: 0,
    outcomeUnknown: 0,
    pending: 0,
    removed: 0,
    synced: 0,
    total: links.length,
  };

  for (const link of links) {
    switch (link.syncState) {
      case 'conflict': {
        summary.conflict += 1;
        break;
      }
      case 'outcome_unknown': {
        summary.outcomeUnknown += 1;
        break;
      }
      case 'pending': {
        summary.pending += 1;
        break;
      }
      case 'removed':
      case 'unlinked': {
        summary.removed += 1;
        break;
      }
      case 'synced': {
        summary.synced += 1;
        break;
      }
    }
  }

  return summary;
};

export const getIssueLinkUrl = (link: LinearIssueLinkView) =>
  link.remoteSnapshot?.url ?? link.lastConfirmedSnapshot.url ?? undefined;

export const getIssueLinkTitle = (link: LinearIssueLinkView) =>
  link.remoteSnapshot?.title ?? link.lastConfirmedSnapshot.title ?? link.linearIdentifier;

export type LinearWizardStepId =
  'automation' | 'binding' | 'import' | 'installation' | 'mapping' | 'scope' | 'sync';

export type LinearWizardStepState = {
  complete: boolean;
  enabled: boolean;
};

export const getWizardStepStates = (input: {
  hasBinding: boolean;
  hasScope: boolean;
  isConnected: boolean;
  isSyncEnabled: boolean;
  installationIsActive: boolean;
}): Record<LinearWizardStepId, LinearWizardStepState> => ({
  automation: {
    complete: input.isSyncEnabled,
    enabled: input.hasBinding && input.isSyncEnabled,
  },
  binding: {
    complete: input.hasBinding,
    enabled: input.hasScope,
  },
  import: {
    complete: input.hasBinding,
    enabled: input.hasBinding,
  },
  installation: {
    complete: input.isConnected && input.installationIsActive,
    enabled: true,
  },
  mapping: {
    complete: input.hasBinding,
    enabled: input.hasBinding,
  },
  scope: {
    complete: input.hasScope,
    enabled: input.isConnected && input.installationIsActive,
  },
  sync: {
    complete: input.isSyncEnabled,
    enabled: input.hasBinding,
  },
});
