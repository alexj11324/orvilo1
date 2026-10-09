export interface IssueDetailCapabilityInput {
  /** `usePermission('create_content').allowed`. */
  allowed: boolean;
  /** The issue's `domainRevision`; resource commands carry it, so they wait for it. */
  hasDomainRevision: boolean;
  /** The issue's database id; resource commands address it, not the identifier. */
  hasTaskId: boolean;
  /** `usePermission('create_content').reason`. */
  reason?: string;
}

export interface IssueDetailCapabilities {
  /** The user may add links, pull requests or documents right now. */
  canAddResource: boolean;
  /** The user may add a sub-issue. */
  canAddSubIssue: boolean;
  /** Title renders as plain text and the property editors are unavailable. */
  readOnly: boolean;
  /** The user's own words for why the issue is read-only. */
  readOnlyReason?: string;
  /** Why attached-resource commands are unavailable though the user may edit. */
  resourceBlockedReason?: 'loading';
}

/**
 * What the current viewer can do on an issue detail body. Read-only viewers
 * get no add actions, a plain-text title and readable non-editable properties; editors
 * get resource commands only once the issue has the ids those commands need.
 */
export const resolveIssueDetailCapabilities = ({
  allowed,
  hasDomainRevision,
  hasTaskId,
  reason,
}: IssueDetailCapabilityInput): IssueDetailCapabilities => {
  if (!allowed) {
    return {
      canAddResource: false,
      canAddSubIssue: false,
      readOnly: true,
      readOnlyReason: reason,
    };
  }

  const resourcesReady = hasTaskId && hasDomainRevision;
  return {
    canAddResource: resourcesReady,
    canAddSubIssue: true,
    readOnly: false,
    resourceBlockedReason: resourcesReady ? undefined : 'loading',
  };
};
