'use client';

import { cn } from 'cn';
import { AnimatePresence, useIsPresent } from 'motion/react';
import * as m from 'motion/react-m';
import { type ReactNode } from 'react';
import { memo, useMemo, useRef } from 'react';
import { useMediaQuery } from 'react-responsive';

import { Freeze } from '@/components/Freeze';
import RightPanel from '@/features/RightPanel';
import { usePermission } from '@/hooks/usePermission';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';
import type { PanelSlideMotionDirection } from '@/utils/motion/panelSlideMotion';
import {
  isPanelLayerMotionDisabled,
  panelSlideMotionVariantsLeft,
} from '@/utils/motion/panelSlideMotion';

import Conversation from '../Copilot/Conversation';
import HistoryPanel from '../History';
import { selectors, usePageEditorStore } from '../store';
import { usePageAgentPanelControl } from './OverrideContext';

const styles = {
  inner: 'relative flex h-full w-full min-h-0 flex-1 flex-col overflow-hidden',
  layer: 'absolute inset-0 flex min-h-full max-h-full flex-col overflow-hidden',
};

const ExitingFrozenContent = memo<{ children: ReactNode }>(({ children }) => {
  const isPresent = useIsPresent();

  return <Freeze frozen={!isPresent}>{children}</Freeze>;
});

ExitingFrozenContent.displayName = 'PageEditorExitingFrozenContent';

const PageEditorRightPanelContent = memo(() => {
  const rightPanelMode = usePageEditorStore(selectors.rightPanelMode);
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  const prefersReducedMotion = useMediaQuery({ query: '(prefers-reduced-motion: reduce)' });
  const shouldUseMotion = !isPanelLayerMotionDisabled(animationMode) && !prefersReducedMotion;

  const previousModeRef = useRef(rightPanelMode);
  const directionRef = useRef<PanelSlideMotionDirection>(0);

  if (previousModeRef.current !== rightPanelMode) {
    directionRef.current = rightPanelMode === 'history' ? 1 : -1;
    previousModeRef.current = rightPanelMode;
  }

  const activeContent = useMemo(
    () => ({
      key: rightPanelMode,
      node: rightPanelMode === 'history' ? <HistoryPanel /> : <Conversation />,
    }),
    [rightPanelMode],
  );

  if (!shouldUseMotion) {
    return <div className={styles.layer}>{activeContent.node}</div>;
  }

  return (
    <AnimatePresence custom={directionRef.current} initial={false} mode="sync">
      <m.div
        animate="animate"
        className={cn(styles.layer, 'will-change-[opacity,transform]')}
        custom={directionRef.current}
        exit="exit"
        initial="initial"
        key={activeContent.key}
        variants={panelSlideMotionVariantsLeft}
        transition={{
          ...panelSlideMotionVariantsLeft.transition,
          duration: 0.2,
        }}
      >
        <ExitingFrozenContent>{activeContent.node}</ExitingFrozenContent>
      </m.div>
    </AnimatePresence>
  );
});

PageEditorRightPanelContent.displayName = 'PageEditorRightPanelContent';

const PageEditorRightPanel = memo(() => {
  const { expand, toggle } = usePageAgentPanelControl();
  const rightPanelMode = usePageEditorStore(selectors.rightPanelMode);
  const { allowed: hasEditPermission } = usePermission('edit_own_content');
  const [width, updateSystemStatus] = useGlobalStore((s) => [
    systemStatusSelectors.pageAgentPanelWidth(s),
    s.updateSystemStatus,
  ]);

  // The Page Agent (copilot) stays available even while another member holds the
  // edit lock: a conflicting write is now rejected server-side (CONFLICT) rather
  // than clobbering their edits, so there's no reason to hide it on a locked /
  // read-only page. We only hide it from members without edit permission (a
  // document-editing agent is useless to them); History stays available.
  const effectiveExpand = expand && (rightPanelMode === 'history' || hasEditPermission);

  return (
    <RightPanel
      defaultWidth={width}
      expand={effectiveExpand}
      onExpandChange={(next) => toggle(next)}
      onSizeChange={(size) => {
        if (size?.width) {
          const nextWidth =
            typeof size.width === 'string' ? Number.parseInt(size.width) : size.width;
          if (nextWidth) updateSystemStatus({ pageAgentPanelWidth: nextWidth });
        }
      }}
    >
      <div className={styles.inner}>
        <PageEditorRightPanelContent />
      </div>
    </RightPanel>
  );
});

PageEditorRightPanel.displayName = 'PageEditorRightPanel';

export default PageEditorRightPanel;
