'use client';

import { DraggablePanel } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { memo, useRef, useSyncExternalStore } from 'react';

import { isDesktop } from '@/const/version';
import { useGlobalStore } from '@/store/global';
import {
  NAV_PANEL_MAX_WIDTH,
  NAV_PANEL_MIN_WIDTH,
  systemStatusSelectors,
} from '@/store/global/selectors';
import { isMacOS } from '@/utils/platform';

import { useNavPanelSizeChangeHandler } from './hooks/useNavPanel';
import { getNavPanelRegistrySnapshot, subscribeNavPanelRegistry } from './registry';
import { useActiveNavKey } from './useActiveNavKey';

// The global sidebar keeps the workspace navigation on every route; the
// panel a route registers (agent topics, memory, group, resource library, …)
// renders here as the page-level column between the sidebar and the content —
// the same spot the nav panel occupied before the ReUI shell.
const styles = createStaticStyles(({ css, cssVar }) => ({
  inner: css`
    position: relative;

    overflow: hidden;
    flex: 1;

    min-width: 240px;
    max-width: 100%;
    min-height: 0;
  `,
  panel: css`
    user-select: none;
    height: 100%;
    color: ${cssVar.colorTextSecondary};
    background: ${isDesktop && isMacOS() ? 'transparent' : cssVar.colorBgLayout};

    * {
      user-select: none;
    }
  `,
}));

const classNames = { content: styles.inner };

/** Keys that render inside the global sidebar (NavMain) or have no panel. */
const NON_PANEL_KEYS = new Set(['home', 'settings', 'workspace-settings']);

const resolvePanelNode = (navKey: string) =>
  NON_PANEL_KEYS.has(navKey) ? undefined : getNavPanelRegistrySnapshot().get(navKey)?.node;

export const useRoutePanelNode = () => {
  const activeNavKey = useActiveNavKey();
  const getNode = () => resolvePanelNode(activeNavKey);
  return useSyncExternalStore(subscribeNavPanelRegistry, getNode, getNode);
};

const RoutePanelColumn = memo(() => {
  const activeNavKey = useActiveNavKey();
  const node = useRoutePanelNode();

  const isStatusInit = useGlobalStore(systemStatusSelectors.isStatusInit);
  const handleSizeChange = useNavPanelSizeChangeHandler();

  // Defer DraggablePanel mount until system status hydrates; otherwise
  // defaultSize captures the pre-hydration default and the column drifts off
  // the persisted width.
  const defaultWidthRef = useRef(0);
  if (defaultWidthRef.current === 0 && isStatusInit) {
    defaultWidthRef.current = systemStatusSelectors.leftPanelWidth(useGlobalStore.getState());
  }

  if (!node) return null;

  if (defaultWidthRef.current === 0) {
    const pendingWidth = systemStatusSelectors.leftPanelWidth(useGlobalStore.getState());
    return <div aria-hidden style={{ flexShrink: 0, height: '100%', width: pendingWidth }} />;
  }

  return (
    <DraggablePanel
      expand
      className={styles.panel}
      classNames={classNames}
      defaultSize={{ height: '100%', width: defaultWidthRef.current }}
      expandable={false}
      maxWidth={NAV_PANEL_MAX_WIDTH}
      minWidth={NAV_PANEL_MIN_WIDTH}
      placement="left"
      showBorder={false}
      onSizeDragging={handleSizeChange}
    >
      <div className={styles.inner} key={activeNavKey}>
        {node}
      </div>
    </DraggablePanel>
  );
});

RoutePanelColumn.displayName = 'RoutePanelColumn';

export default RoutePanelColumn;
