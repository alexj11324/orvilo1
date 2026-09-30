'use client';

import { cssVar } from 'antd-style';
import { memo, useState } from 'react';

import MobileContentLayout from '@/components/server/MobileNavLayout';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCategory } from '@/features/AgentSetting/AgentCategory/useCategory';
import AgentSettings from '@/features/AgentSetting/AgentSettings';
import Footer from '@/features/Setting/Footer';
import { usePermission } from '@/hooks/usePermission';
import MobileHeader from '@/routes/(mobile)/chat/settings/_layout/Header';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { ChatSettingsTabs } from '@/store/global/initialState';
import { useSessionStore } from '@/store/session';

export default memo(() => {
  const [tab, setTab] = useState(ChatSettingsTabs.Prompt);
  const cateItems = useCategory();
  const id = useSessionStore((s) => s.activeId);
  const { allowed: canEdit } = usePermission('edit_own_content');

  const [updateAgentConfig, updateAgentMeta, config, meta] = useAgentStore((s) => [
    s.updateAgentConfig,
    s.updateAgentMeta,
    agentSelectors.currentAgentConfig(s),
    agentSelectors.currentAgentMeta(s),
  ]);

  const isLoading = false;

  return (
    <MobileContentLayout header={<MobileHeader />}>
      <Tabs
        value={tab}
        style={{
          borderBottom: `1px solid ${cssVar.colorBorderSecondary}`,
        }}
        onValueChange={(value) => setTab(value as ChatSettingsTabs)}
      >
        <TabsList>
          {cateItems.map((item) => (
            <TabsTrigger key={item.key} value={item.key}>
              {item.icon}
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <AgentSettings
        config={config}
        disabled={!canEdit}
        id={id}
        loading={isLoading}
        meta={meta}
        tab={tab}
        onConfigChange={updateAgentConfig}
        onMetaChange={updateAgentMeta}
      />
      <Footer />
    </MobileContentLayout>
  );
});
