'use client';

import { cn } from 'cn';
import {
  CopyXIcon,
  PlusIcon,
  SquareSplitHorizontalIcon,
  SquareTerminalIcon,
  XIcon,
} from 'lucide-react';
import { memo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { ContextMenuTrigger, type DropdownItem as ContextMenuItem } from '@/components/ItemsMenu';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';
import { useElectronStore } from '@/store/electron';
import { useGlobalStore } from '@/store/global';

import SplitView from './SplitView';
import type { TerminalTab } from './store';
import { useChatTerminalStore } from './store';

const EMPTY_TABS: TerminalTab[] = [];

const styles = {
  container: 'overflow-hidden h-full bg-card bg-none',
  indicator: 'rounded-(--radius-card) bg-selected bg-none shadow-none',
  tab: 'gap-1 h-6 ps-2 pe-1 font-normal data-active:text-foreground',
  tabBar: 'flex-none py-1 px-2 [border-block-end:1px_solid_var(--sidebar-border)]',
  tabList: 'gap-1 p-0 rounded-none bg-transparent bg-none',
  tabs: 'w-auto',
  view: 'overflow-hidden flex-1 min-h-0 pbs-1 pbe-2 px-3',
};

const Content = memo(() => {
  const { t } = useTranslation('chat');

  const topicId = useChatStore((s) => s.activeTopicId);
  const agentId = useChatStore((s) => s.activeAgentId);
  const topicWorkingDirectory = useChatStore(topicSelectors.currentTopicWorkingDirectory);
  const currentDeviceId = useElectronStore((s) => s.gatewayDeviceInfo?.deviceId);
  const agentWorkingDirectory = useAgentStore((s) =>
    agentId
      ? agentByIdSelectors.getAgentWorkingDirectoryById(agentId, currentDeviceId)(s)
      : undefined,
  );
  const toggleTerminalPanel = useGlobalStore((s) => s.toggleTerminalPanel);

  // Tabs are bound to the topic: sessions created here only show for this topic.
  const topicKey = topicId || (agentId ? `agent:${agentId}` : 'global');
  const cwd = topicWorkingDirectory || agentWorkingDirectory || undefined;

  const tabs = useChatTerminalStore((s) => s.tabsByTopic[topicKey]) ?? EMPTY_TABS;
  const activeTabId = useChatTerminalStore((s) => s.activeTabIds[topicKey]);
  const creating = useChatTerminalStore((s) => !!s.creatingByTopic[topicKey]);
  const createError = useChatTerminalStore((s) => s.createErrors[topicKey]);
  const createTab = useChatTerminalStore((s) => s.createTab);
  const closeTab = useChatTerminalStore((s) => s.closeTab);
  const closeOtherTabs = useChatTerminalStore((s) => s.closeOtherTabs);
  const setActiveTab = useChatTerminalStore((s) => s.setActiveTab);
  const splitPane = useChatTerminalStore((s) => s.splitPane);
  const closePane = useChatTerminalStore((s) => s.closePane);
  const setActivePane = useChatTerminalStore((s) => s.setActivePane);
  const setPaneFlex = useChatTerminalStore((s) => s.setPaneFlex);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs.at(-1);

  const prevTabCountRef = useRef(0);

  // Open a first shell automatically when this topic has none yet. Runs on
  // open / topic switch only — NOT on tab-count changes, so closing the last
  // tab doesn't immediately respawn a shell.
  useEffect(() => {
    prevTabCountRef.current = tabs.length;
    if (tabs.length === 0) void createTab(topicKey, cwd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicKey]);

  // Closing the last tab (X button or the shell exiting) collapses the panel.
  useEffect(() => {
    if (tabs.length === 0 && prevTabCountRef.current > 0) toggleTerminalPanel(false);
    prevTabCountRef.current = tabs.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.length]);

  const tabMenuItems = (tabId: string): ContextMenuItem[] => [
    {
      icon: XIcon,
      key: 'close',
      label: t('terminalPanel.closeTab'),
      onClick: () => closeTab(topicKey, tabId),
    },
    {
      disabled: tabs.length <= 1,
      icon: CopyXIcon,
      key: 'closeOthers',
      label: t('terminalPanel.closeOtherTabs'),
      onClick: () => closeOtherTabs(topicKey, tabId),
    },
  ];

  return (
    <div className={cn(styles.container, 'flex flex-col')}>
      <div className={cn(styles.tabBar, 'flex items-center gap-1')}>
        <Tabs
          className={styles.tabs}
          value={activeTab?.id ?? null}
          onValueChange={(next) => {
            if (typeof next === 'string') setActiveTab(topicKey, next);
          }}
        >
          <TabsList className={styles.tabList}>
            {tabs.map((tab) => (
              <ContextMenuTrigger items={() => tabMenuItems(tab.id)} key={tab.id}>
                <TabsTrigger className={styles.tab} value={tab.id}>
                  <SquareTerminalIcon size={12} />
                  {tab.title}
                  <ActionIcon
                    icon={XIcon}
                    size={{ blockSize: 20, size: 12 }}
                    title={t('terminalPanel.closeTab')}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(topicKey, tab.id);
                    }}
                  />
                </TabsTrigger>
              </ContextMenuTrigger>
            ))}
          </TabsList>
        </Tabs>
        <ActionIcon
          icon={PlusIcon}
          loading={creating}
          size={'small'}
          title={t('terminalPanel.newTab')}
          onClick={() => createTab(topicKey, cwd)}
        />
        <div className="flex flex-col flex-1" />
        <ActionIcon
          disabled={!activeTab || creating}
          icon={SquareSplitHorizontalIcon}
          size={'small'}
          title={t('terminalPanel.split')}
          onClick={() => activeTab && splitPane(topicKey, activeTab.id, cwd)}
        />
        <ActionIcon
          icon={XIcon}
          size={'small'}
          title={t('terminalPanel.close')}
          onClick={() => toggleTerminalPanel(false)}
        />
      </div>
      <div className={styles.view}>
        {activeTab ? (
          <SplitView
            activePaneId={activeTab.activePaneId}
            panes={activeTab.panes}
            onActivatePane={(paneId) => setActivePane(topicKey, activeTab.id, paneId)}
            onClosePane={(paneId) => closePane(topicKey, paneId)}
            onResize={(flex) => setPaneFlex(topicKey, activeTab.id, flex)}
          />
        ) : createError ? (
          <div className="flex flex-col items-center flex-1 gap-2 h-full justify-center">
            <div className="text-muted-foreground">{t('terminalPanel.createFailed')}</div>
            <Button size="sm" onClick={() => createTab(topicKey, cwd)}>
              {t('retry', { ns: 'common' })}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
});

export default Content;
