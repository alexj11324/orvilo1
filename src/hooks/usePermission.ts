import { getWorkspaceRolePermissionCodes } from '@orvilo/const/rbac';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useFetchWorkspaces } from '@/business/client/hooks/useFetchWorkspaces';

export interface Permission {
  allowed: boolean;
  /**
   * Localised tooltip text explaining why the action is blocked. `undefined`
   * when allowed, so unconditional `<Tooltip title={reason}>` wrappers render
   * nothing instead of an empty tooltip bubble (Tooltip only skips nullish
   * titles, not empty strings).
   */
  reason?: string;
}

export const usePermission = (action: string): Permission => {
  const workspaceId = useActiveWorkspaceId();
  const { data, error, isLoading } = useFetchWorkspaces(!!workspaceId);
  const { t } = useTranslation('setting');
  // This is the workspace role ceiling, not row ownership or Agent Use.
  // Resource-specific guards and the server still decide those capabilities.
  const role = data?.find((workspace) => workspace.id === workspaceId)?.role;
  const codes = role ? getWorkspaceRolePermissionCodes(role) : [];
  const allowed =
    !workspaceId ||
    (!error && !isLoading && (ACTION_CODES[action]?.some((code) => codes.includes(code)) ?? false));
  return { allowed, reason: allowed ? undefined : t('permission.actionDenied') };
};

const ACTION_CODES: Record<string, readonly string[]> = {
  create_content: ['agent:create:owner', 'agent:create:all'],
  edit_others_content: ['agent:update:all'],
  edit_own_content: ['agent:update:owner', 'agent:update:all'],
  manage_provider_key: ['ai_provider:update:all'],
  manage_settings: ['workspace:settings_update:all'],
  view_billing: ['workspace:billing_read:all'],
};
