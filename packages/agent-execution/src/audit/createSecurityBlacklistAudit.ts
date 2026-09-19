import {
  type DynamicInterventionResolver,
  type GlobalInterventionAuditConfig,
  type HumanInterventionPolicy,
  type SecurityBlacklistConfig,
} from '@orvilo/types';

import { DEFAULT_SECURITY_BLACKLIST } from './defaultSecurityBlacklist';
import { InterventionChecker } from './InterventionChecker';

export const SECURITY_BLACKLIST_AUDIT_TYPE = 'securityBlacklist';

/**
 * Create a DynamicInterventionResolver that checks security blacklist rules.
 * Reads blacklist from `metadata.securityBlacklist`, falls back to DEFAULT_SECURITY_BLACKLIST.
 */
export const createSecurityBlacklistAudit = (
  policy: HumanInterventionPolicy = 'always',
): DynamicInterventionResolver => {
  return async (toolArgs: Record<string, any>, metadata?: Record<string, any>) => {
    const securityBlacklist: SecurityBlacklistConfig =
      metadata?.securityBlacklist ?? DEFAULT_SECURITY_BLACKLIST;
    const filteredBlacklist = securityBlacklist.filter(
      (rule) => (rule.policy ?? 'always') === policy,
    );
    const result = InterventionChecker.checkSecurityBlacklist(filteredBlacklist, toolArgs);
    return result.blocked;
  };
};

/**
 * Create the default security blacklist global audit config.
 */
export const createSecurityBlacklistGlobalAudit = (
  policy: HumanInterventionPolicy = 'always',
): GlobalInterventionAuditConfig => ({
  policy,
  resolver: createSecurityBlacklistAudit(policy),
  type: SECURITY_BLACKLIST_AUDIT_TYPE,
});
