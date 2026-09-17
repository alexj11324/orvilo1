'use client';

import { Flexbox } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { memo, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';

import NotFound from '@/components/404';
import AsyncBoundary from '@/components/AsyncBoundary';
import SurfaceSkeleton from '@/components/Skeleton/Surface';
import ResourceConfigAccessGate from '@/features/ResourcePermission/ResourceConfigAccessGate';
import { usePermission } from '@/hooks/usePermission';
import type { SerializedPlatformDefinition } from '@/server/services/bot/platforms/types';
import { useAgentStore } from '@/store/agent';
import { useUserStore } from '@/store/user';
import { labPreferSelectors } from '@/store/user/selectors';

import { BOT_RUNTIME_STATUSES, type BotRuntimeStatus } from '../../../../types/botRuntimeStatus';
import { visibleChannelPlatforms } from './const';
import PlatformDetail from './detail';
import Header from './Header';
import PlatformGrid from './list';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    overflow-y: auto;
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;

    width: 100%;
    height: 100%;
  `,
}));

const ChannelContent = memo(() => {
  const { aid, platform } = useParams<{ aid?: string; platform?: string }>();
  const navigate = useNavigate();
  const { allowed: canEdit } = usePermission('edit_own_content');

  const {
    data: platforms,
    isLoading: platformsLoading,
    error: platformsError,
    mutate: mutatePlatforms,
  } = useAgentStore((s) => s.useFetchPlatformDefinitions());
  const {
    data: providers,
    isLoading: providersLoading,
    error: providersError,
    mutate: mutateProviders,
  } = useAgentStore((s) => s.useFetchBotProviders(aid));
  const triggerRefreshAllBotStatuses = useAgentStore((s) => s.triggerRefreshAllBotStatuses);
  const enableImessage = useUserStore(labPreferSelectors.enableImessage);

  // Fire-and-forget a live gateway status refresh on entry. The list renders
  // from cached statuses immediately; SWR revalidates once Redis is updated.
  useEffect(() => {
    if (!aid) return;
    if (!canEdit) return;
    triggerRefreshAllBotStatuses(aid);
  }, [aid, canEdit, triggerRefreshAllBotStatuses]);

  const isLoading = platformsLoading || providersLoading;
  const error = platformsError ?? providersError;

  // The platforms fetch carries `fallbackData: []`, so a *failed* fetch leaves
  // `platforms = []` — a bare `length > 0` check can't distinguish "no
  // platforms" from "fetch failed". Gate on the raw fetched `platforms` and
  // require the providers fetch to have not errored, so a failed load branches
  // to the error state instead of rendering an empty catalog.
  const hasData = (platforms?.length ?? 0) > 0 && !providersError;

  // iMessage is registered server-side but stays behind the `enableImessage`
  // lab flag: hidden until the flag turns the capability on.
  const allPlatforms = useMemo<SerializedPlatformDefinition[]>(
    () => visibleChannelPlatforms(platforms ?? [], { enableImessage }),
    [platforms, enableImessage],
  );

  const platformRuntimeStatuses = useMemo(
    () =>
      new Map<string, BotRuntimeStatus>(
        (providers ?? [])
          .filter((provider) => provider.enabled)
          .map((provider) => [
            provider.platform,
            ((provider as any).runtimeStatus as BotRuntimeStatus) ??
              BOT_RUNTIME_STATUSES.disconnected,
          ]),
      ),
    [providers],
  );

  const activePlatformDef = useMemo(
    () => (platform ? allPlatforms.find((item) => item.id === platform) : undefined),
    [allPlatforms, platform],
  );

  const currentConfig = useMemo(
    () => providers?.find((item) => item.platform === platform),
    [platform, providers],
  );

  const handleSelectPlatform = useCallback(
    (platformId: string) => navigate(platformId, { relative: 'path' }),
    [navigate],
  );

  if (!aid) return null;

  return (
    <Flexbox flex={1} height={'100%'} style={{ overflow: 'hidden' }}>
      <Header
        agentId={aid}
        currentConfig={currentConfig}
        disabled={!canEdit}
        platformDef={activePlatformDef}
        providers={providers}
        runtimeStatus={
          activePlatformDef ? platformRuntimeStatuses.get(activePlatformDef.id) : undefined
        }
      />
      <Flexbox flex={1} style={{ overflow: 'hidden' }}>
        <AsyncBoundary
          data={hasData ? platforms : undefined}
          error={error}
          errorVariant={'block'}
          isLoading={isLoading}
          loading={<SurfaceSkeleton header={false} variant={'grid'} />}
          onRetry={() => {
            mutatePlatforms();
            mutateProviders();
          }}
        >
          {!platform ? (
            <div className={styles.container}>
              <PlatformGrid
                agentId={aid}
                platforms={allPlatforms}
                runtimeStatuses={platformRuntimeStatuses}
                onSelect={handleSelectPlatform}
              />
            </div>
          ) : activePlatformDef ? (
            <div className={styles.container}>
              <PlatformDetail
                agentId={aid}
                currentConfig={currentConfig}
                disabled={!canEdit}
                platformDef={activePlatformDef}
              />
            </div>
          ) : (
            <NotFound />
          )}
        </AsyncBoundary>
      </Flexbox>
    </Flexbox>
  );
});

const ChannelPage = () => {
  const { aid } = useParams<{ aid?: string }>();

  return (
    <ResourceConfigAccessGate
      redirectPath={`/agent/${aid ?? ''}`}
      resourceId={aid}
      resourceType="agent"
    >
      <ChannelContent />
    </ResourceConfigAccessGate>
  );
};

export default ChannelPage;
