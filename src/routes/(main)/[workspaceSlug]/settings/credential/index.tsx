'use client';

import { Button, Tabs, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { Plus, UserRoundIcon, UsersIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { createCreateCredModal } from '@/features/Settings/creds/features/CreateCredModal';
import CredsList from '@/features/Settings/creds/features/CredsList';
import { type CredsApi, CredsApiProvider } from '@/features/Settings/creds/features/useCredsApi';
import { usePermission } from '@/hooks/usePermission';
import { lambdaClient, lambdaQuery } from '@/libs/trpc/client';

import PersonalCredsSection from './features/PersonalCredsSection';

// Always the personal namespace — the personal scope is deliberately
// personal-scoped regardless of page context (see PersonalCredsSection).
const personalCredsApi: CredsApi = {
  client: lambdaClient.creds,
  query: lambdaQuery.creds,
};

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    overflow: hidden;
    width: 100%;
    padding-block: 4px;
    padding-inline: 16px;
  `,
  desc: css`
    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
  `,
}));

type CredsScope = 'personal' | 'workspace';

/**
 * Workspace credential management.
 *
 * One unified header row — scope tabs on the left, the create action on the
 * right — above an outlined list container (same container treatment as the
 * agent channel detail page). The create button follows the active scope.
 *
 * - "Workspace" tab: the shared {@link CredsList} rebound to the
 *   `workspaceCreds.*` tRPC namespace via {@link CredsApiProvider}.
 *   `workspaceCreds.list` merges the workspace's own credentials with every
 *   member's *published* (public-visibility) shared credentials, so a shared
 *   credential surfaces here automatically once its owner turns on the share
 *   toggle in the personal tab.
 * - "Personal" tab: {@link PersonalCredsSection} — the caller's own personal
 *   credentials, each with a switch to share/unshare it into this workspace
 *   (and a private/public visibility choice once shared). Always
 *   personal-scoped.
 *
 * Credentials are stored in Orvilo's own database — no Market sign-in gate.
 */
const WorkspaceCredsSetting = () => {
  const { t } = useTranslation('setting');
  const { allowed: canManageCredentials, reason } = usePermission('manage_provider_key');
  const [scope, setScope] = useState<CredsScope>('workspace');

  const workspaceCredsApi = useMemo<CredsApi>(
    () => ({
      // The workspaceCreds router is a structural mirror of creds minus the
      // personal-only share/unshare/publish/inject procedures, so strict
      // typeof equality breaks. Cast at the boundary; downstream consumers
      // only touch overlapping members (list/get/createKV/createOAuth/
      // createFile/update/delete/uploadFile/listOAuthConnections).
      client: lambdaClient.workspaceCreds as unknown as CredsApi['client'],
      query: lambdaQuery.workspaceCreds as unknown as CredsApi['query'],
    }),
    [],
  );

  // Pre-fetch the workspace list at page level. React Query deduplicates this
  // against the identical call inside CredsList, so only one network request
  // is made — which is also why `refetch` here refreshes the workspace list
  // too: creating a credential from the header, or sharing/unsharing a
  // credential from the personal tab, changes what this workspace-scoped list
  // should return, but those mutations live in other components with no
  // direct handle on CredsList's own query. Since both hooks share the same
  // query key (workspaceCreds.list, input undefined), refetching this one
  // pushes the fresh result to every subscriber, including CredsList's.
  const { refetch: refetchWorkspaceCreds } = workspaceCredsApi.query.list.useQuery(undefined);

  // Same dedup trick for the personal scope: shares its query key with the
  // list inside PersonalCredsSection, so a create from the unified header
  // refreshes that tab's list (and pre-warms it while the workspace tab is
  // active, since the tabs render only the active scope).
  const { refetch: refetchPersonalCreds } = personalCredsApi.query.list.useQuery(undefined);

  // The Admin-or-higher `manage_provider_key` gate mirrors the server's
  // `withRbacPermission('workspace:update:all')` on workspaceCreds writes —
  // but it only applies to the workspace scope. Personal credentials are the
  // caller's own (`creds`), so workspace RBAC never disables creation there.
  const canCreate = scope === 'workspace' ? canManageCredentials : true;
  const createBlockedReason = scope === 'workspace' && !canManageCredentials ? reason : '';

  const handleCreate = () => {
    if (!canCreate) return;
    if (scope === 'workspace') {
      createCreateCredModal({
        credsApi: workspaceCredsApi,
        onSuccess: () => refetchWorkspaceCreds(),
      });
    } else {
      createCreateCredModal({
        credsApi: personalCredsApi,
        onSuccess: () => refetchPersonalCreds(),
      });
    }
  };

  const createButton = (
    <Button disabled={!canCreate} icon={<Plus />} type={'primary'} onClick={handleCreate}>
      {t('creds.create')}
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 justify-between">
        <Tabs
          activeKey={scope}
          items={[
            {
              icon: <UsersIcon />,
              key: 'workspace',
              label: t('creds.tabs.workspace'),
            },
            {
              icon: <UserRoundIcon />,
              key: 'personal',
              label: t('creds.tabs.personal'),
            },
          ]}
          onChange={(key) => setScope(key as CredsScope)}
        />
        {
          // Disabled buttons swallow hover events, so the tooltip needs the
          // span wrapper to fire (see the usePermission docstring pattern).
          createBlockedReason ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span style={{ display: 'inline-flex' }}>
                      <span>{createButton}</span>
                    </span>
                  }
                />
                <TooltipContent>{createBlockedReason}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            createButton
          )
        }
      </div>
      <div className="flex flex-col gap-3">
        <Text className={styles.desc}>
          {scope === 'workspace'
            ? t('creds.workspaceSection.desc')
            : t('creds.personalSection.desc')}
        </Text>
        <div
          className={cn('flex flex-col', styles.container)}
          style={{ border: `1px solid ${cssVar.colorBorder}`, borderRadius: cssVar.borderRadiusLG }}
        >
          {scope === 'workspace' ? (
            <CredsApiProvider value={workspaceCredsApi}>
              <CredsList />
            </CredsApiProvider>
          ) : (
            <PersonalCredsSection onWorkspaceCredsChange={refetchWorkspaceCreds} />
          )}
        </div>
      </div>
    </div>
  );
};

WorkspaceCredsSetting.displayName = 'WorkspaceCredsSetting';

export default WorkspaceCredsSetting;
