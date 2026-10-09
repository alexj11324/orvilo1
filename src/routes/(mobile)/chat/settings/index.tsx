'use client';

import { cssVar } from 'antd-style';
import { createElement, isValidElement, memo, useCallback, useState } from 'react';

import MobileContentLayout from '@/components/server/MobileNavLayout';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { resolveActiveTab } from '@/features/AgentSetting/AgentCategory/resolveActiveTab';
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
  const [selectedTab, setTab] = useState<ChatSettingsTabs>();
  const cateItems = useCategory();
  const tab = resolveActiveTab(cateItems, selectedTab);
  const id = useSessionStore((s) => s.activeId);
  const { allowed: canEdit } = usePermission('edit_own_content');

  const [updateAgentConfig, updateAgentMeta, config, meta] = useAgentStore((s) => [
    s.updateAgentConfig,
    s.updateAgentMeta,
    agentSelectors.currentAgentConfig(s),
    agentSelectors.currentAgentMeta(s),
  ]);

  const updateMetadata = useCallback(
    (next: Parameters<typeof updateAgentMeta>[0]) => updateAgentMeta(next, { rethrow: true }),
    [updateAgentMeta],
  );

  const isLoading = false;

  return (
    <MobileContentLayout header={<MobileHeader />}>
      <Tabs
        value={tab ?? ''}
        style={{
          borderBottom: `1px solid ${cssVar.colorBorderSecondary}`,
        }}
        onValueChange={(value) => setTab(value as ChatSettingsTabs)}
      >
        <TabsList>
          {(cateItems ?? []).map((item) => (
            <TabsTrigger key={item.key} value={item.key}>
              {isValidElement(item.icon)
                ? item.icon
                : typeof item.icon === 'function'
                  ? createElement(item.icon)
                  : null}
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
        tab={tab ?? ChatSettingsTabs.Opening}
        onConfigChange={updateAgentConfig}
        onMetaChange={updateMetadata}
      />
      <Footer />
    </MobileContentLayout>
  );
});
