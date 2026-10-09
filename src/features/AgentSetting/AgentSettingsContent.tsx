import { type ReactNode } from 'react';
import { memo } from 'react';

import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { ChatSettingsTabs } from '@/store/global/initialState';
import { featureFlagsSelectors, useServerConfigStore } from '@/store/serverConfig';

import AgentConnectors from './AgentConnectors';
import AgentGraphRuntime from './AgentGraphRuntime';
import AgentOpening from './AgentOpening';
import AgentRules from './AgentRules';
import AgentSelfIteration from './AgentSelfIteration';

export interface AgentSettingsContentProps {
  loadingSkeleton: ReactNode;
  tab: ChatSettingsTabs;
}

const AgentSettingsContent = memo<AgentSettingsContentProps>(({ tab, loadingSkeleton }) => {
  const loading = useAgentStore(agentSelectors.isAgentConfigLoading);
  const { enableAgentSelfIteration } = useServerConfigStore(featureFlagsSelectors);

  if (loading) return loadingSkeleton;

  return (
    <>
      {tab === ChatSettingsTabs.Opening && <AgentOpening />}
      {tab === ChatSettingsTabs.Rules && <AgentRules />}
      {enableAgentSelfIteration && tab === ChatSettingsTabs.SelfIteration && <AgentSelfIteration />}
      {tab === ChatSettingsTabs.Graph && <AgentGraphRuntime />}
      {tab === ChatSettingsTabs.Connector && <AgentConnectors />}
    </>
  );
});

export default AgentSettingsContent;
