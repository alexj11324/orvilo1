import { type GlobalInterventionAuditConfig } from '@orvilo/types';

import { createSecurityBlacklistGlobalAudit } from './createSecurityBlacklistAudit';

export const createDefaultGlobalAudits = (): GlobalInterventionAuditConfig[] => [
  createSecurityBlacklistGlobalAudit(),
  createSecurityBlacklistGlobalAudit('required'),
];
