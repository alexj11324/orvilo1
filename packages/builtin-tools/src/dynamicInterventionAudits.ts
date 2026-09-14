import { pathScopeAudit } from '@orvilo/builtin-tool-local-system';
import { type DynamicInterventionResolver } from '@orvilo/types';

export const dynamicInterventionAudits: Record<string, DynamicInterventionResolver> = {
  pathScopeAudit,
};
