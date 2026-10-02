'use client';

import { type FC } from 'react';
import { memo, Suspense } from 'react';
import { useParams } from 'react-router';

import AsyncBoundary from '@/components/AsyncBoundary';
import { delayed } from '@/components/Skeleton/Delayed';
import ProfileSkeleton from '@/components/Skeleton/Profile';
import AgentBuilder from '@/features/AgentBuilder';
import ResourceConfigAccessGate from '@/features/ResourcePermission/ResourceConfigAccessGate';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePermission } from '@/hooks/usePermission';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { StyleSheet } from '@/utils/styles';

import EditLockDriver from './features/EditLockDriver';
import Header from './features/Header';
import ProfileEditor from './features/ProfileEditor';
import ProfileHydration from './features/ProfileHydration';
import ProfileProvider from './features/ProfileProvider';
import { selectors as profileSelectors, useProfileStore } from './features/store';
import { useClickToFocusEditor } from './features/useClickToFocusEditor';

const styles = StyleSheet.create({
  contentWrapper: {
    cursor: 'text',
    display: 'flex',
    overflowY: 'auto',
    position: 'relative',
  },
  profileArea: {
    minWidth: 0,
  },
});

const ProfileArea = memo(() => {
  const editor = useProfileStore((s) => s.editor);
  const isAgentConfigLoading = useAgentStore(agentSelectors.isAgentConfigLoading);
  // `isAgentConfigLoading` is data-presence ("no config in the map yet"), so a
  // *failed* config fetch keeps the map empty and would spin forever. The store
  // records the fetch error in `agentConfigErrorMap` — read it so failure shows a
  // reload state (via `retryAgentConfigFetch`) instead of a permanent skeleton.
  const configError = useAgentStore(agentSelectors.currentAgentConfigError);
  const retryAgentConfigFetch = useAgentStore((s) => s.retryAgentConfigFetch);
  const { allowed: canEdit } = usePermission('edit_own_content');
  const handleContentClick = useClickToFocusEditor(editor, canEdit);
  const isMobile = useIsMobile();

  return (
    <>
      <div className="flex flex-col flex-1" style={{ height: '100%', ...styles.profileArea }}>
        <AsyncBoundary
          // Config lives in the map only after a successful fetch — so "settled"
          // is exactly "not still loading". A truthy sentinel on success lets the
          // error branch win over the loading branch when the fetch failed (the
          // map is empty in both, but the error should show, not the skeleton).
          data={isAgentConfigLoading ? undefined : true}
          error={configError}
          errorVariant={'page'}
          // `isAgentConfigLoading` is data-presence (empty map), true on error too;
          // gate on `!configError` so under loading→error precedence the loading
          // branch yields to the error state instead of spinning forever.
          isLoading={isAgentConfigLoading && !configError}
          loading={<ProfileSkeleton />}
          onRetry={() => retryAgentConfigFetch()}
        >
          {/* The desktop header is nav chrome (breadcrumb, tabs, action menu)
              that has no room on a narrow viewport — the mobile settings
              shell already supplies the back affordance and page title. */}
          {isMobile ? null : <Header />}
          <div
            className="flex"
            style={{
              height: '100%',
              width: '100%',
              ...styles.contentWrapper,
              cursor: canEdit ? 'text' : 'default',
            }}
            onClick={handleContentClick}
          >
            <WideScreenContainer>
              <ProfileEditor />
            </WideScreenContainer>
          </div>
        </AsyncBoundary>
      </div>
      {/* Mounted unconditionally (not behind the config-loading gate) so the lock
          is peeked on open and resolved before the editor renders. */}
      <EditLockDriver />
      <Suspense fallback={null}>
        <ProfileHydration />
      </Suspense>
    </>
  );
});
// Hide the Agent Builder while another member holds the edit lock (it drives
// updateAgentConfig, which the server rejects under the lock) and while the lock
// is still resolving — so it doesn't flash in then vanish once a lock is found.
const AgentBuilderSlot = memo(() => {
  const isHeterogeneous = useAgentStore(agentSelectors.isCurrentAgentHeterogeneous);
  const lockedByOther = useProfileStore(profileSelectors.lockedByOther);
  const lockPending = useProfileStore(profileSelectors.lockPending);
  const isMobile = useIsMobile();
  // The builder is a desktop side rail — on mobile it widens the page past the
  // viewport; the same config it edits is reachable through the stacked cards.
  if (isMobile || isHeterogeneous || lockedByOther || lockPending) return null;
  return <AgentBuilder />;
});

const AgentProfile: FC<{ agentId?: string }> = ({ agentId: agentIdProp }) => {
  const { aid } = useParams<{ aid: string }>();
  // Embedded hosts (Settings → Agents) pass the id in since `:aid` only exists
  // on the agent route — which now redirects here.
  const agentId = agentIdProp ?? aid;

  return (
    <Suspense fallback={delayed(<ProfileSkeleton />)}>
      <ResourceConfigAccessGate
        loading={<ProfileSkeleton />}
        redirectPath={agentIdProp ? '/settings/agents' : `/agent/${agentId ?? ''}`}
        resourceId={agentId}
        resourceType="agent"
      >
        <ProfileProvider>
          <div className="flex" style={{ height: '100%', width: '100%' }}>
            <ProfileArea />
            <AgentBuilderSlot />
          </div>
        </ProfileProvider>
      </ResourceConfigAccessGate>
    </Suspense>
  );
};

export default AgentProfile;
