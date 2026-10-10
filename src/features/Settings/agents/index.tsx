'use client';

import { memo, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { AgentSetupPrompt } from '@/features/AgentOnboarding';
import SettingContainer from '@/features/Setting/SettingContainer';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useFetchAgentList } from '@/hooks/useFetchAgentList';
import { useAgentStore } from '@/store/agent';
import { useChatStore } from '@/store/chat';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

import AgentSettingsDetailPage from './AgentSettingsDetailPage';
import { AgentSettingsList } from './AgentSettingsList';

/**
 * Scope the settings host to the `:sub` route param — the per-agent settings
 * body reads `activeAgentId` from the agent/chat stores exactly like the agent
 * workspace layout does (`useAgentIdStoreSync`), so the same sync contract is
 * mirrored here while the detail page is mounted.
 */
const useScopedAgent = (agentId: string) => {
  useLayoutEffect(() => {
    if (useAgentStore.getState().activeAgentId !== agentId) {
      useAgentStore.setState({ activeAgentId: agentId }, false, 'settingsAgents/scope');
    }
    if (useChatStore.getState().activeAgentId !== agentId) {
      useChatStore.setState({ activeAgentId: agentId }, false, 'settingsAgents/scope');
    }
  }, [agentId]);

  useLayoutEffect(
    () => () => {
      useAgentStore.setState({ activeAgentId: undefined }, false, 'settingsAgents/unscope');
      useChatStore.setState(
        { activeAgentId: undefined, activeTopicId: undefined },
        false,
        'settingsAgents/unscope',
      );
    },
    [],
  );
};

/**
 * `/settings/agents/:agentId` — the native per-agent settings page: a compact
 * identity header and the grouped sections, with zero profile chrome (no
 * Hero, breadcrumb, tabs or builder rail). The profile route stays for compat
 * but settings never mounts it.
 */
const AgentSettingsDetail = memo<{ agentId: string }>(({ agentId }) => {
  useScopedAgent(agentId);
  const isLogin = useUserStore(authSelectors.isLogin);
  const useFetchAgentConfig = useAgentStore((s) => s.useFetchAgentConfig);
  useFetchAgentConfig(isLogin, agentId);

  return <AgentSettingsDetailPage agentId={agentId} />;
});

AgentSettingsDetail.displayName = 'AgentSettingsDetail';

/**
 * `/settings/agents` — pick which agent to configure. A plain list: the work
 * surface stays the topic list; this page is configuration only.
 */
const AgentSettingsIndex = memo(() => {
  const { t } = useTranslation('setting');
  const navigate = useWorkspaceAwareNavigate();
  const { error, mutate } = useFetchAgentList();

  return (
    <SettingContainer paddingBlock={'24px 128px'} paddingInline={24} width="form">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="text-[20px] font-semibold">{t('tab.agents')}</div>
            <div className="text-[13px]" style={{ color: 'var(--ant-color-text-description)' }}>
              {t('agentsIndexHint')}
            </div>
          </div>
        </div>
        <AgentSetupPrompt />
        <AgentSettingsList
          error={error}
          onRetry={() => mutate()}
          onSelect={(id) => navigate(`/settings/agents/${id}`, { escape: true })}
        />
      </div>
    </SettingContainer>
  );
});

AgentSettingsIndex.displayName = 'AgentSettingsIndex';

/**
 * Settings → Agents. Level-3 configuration home: `/settings/agents` lists the
 * agents, `/settings/agents/:sub` edits one — the same `SettingsContent`
 * `:tab/:sub` param contract every settings page already uses.
 */
const AgentsSettings = memo(() => {
  const { sub } = useParams<{ sub?: string }>();
  return sub ? <AgentSettingsDetail agentId={sub} key={sub} /> : <AgentSettingsIndex />;
});

AgentsSettings.displayName = 'AgentsSettings';

export default AgentsSettings;
