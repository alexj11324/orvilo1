'use client';

import { TITLE_BAR_HEIGHT } from '@orvilo/desktop-bridge';
import { clsx } from 'cn';
import { ChevronUp } from 'lucide-react';
import { AnimatePresence, usePresence } from 'motion/react';
import {
  type CSSProperties,
  type HTMLAttributes,
  memo,
  type Ref,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { isDesktop } from '@/const/version';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import ApprovalCard from './ApprovalCard';
import motionStyles from './ApprovalMotion.module.css';
import { styles } from './styles';
import { useApprovalMotion } from './useApprovalMotion';
import { useGlobalPendingApprovals } from './useGlobalPendingApprovals';

// Presence retains an exiting approval only for the actual resolved duration.
// Native CSS owns paint; live preference changes cancel transitions without
// remounting the currently actionable card or its child state.
const ApprovalSurface = ({
  ref,
  className,
  style,
  pill,
  ...props
}: HTMLAttributes<HTMLDivElement> & { pill?: boolean; ref?: Ref<HTMLDivElement> }) => {
  const [isPresent, safeToRemove] = usePresence();
  const { enabled, durationMs } = useApprovalMotion();

  useEffect(() => {
    if (isPresent || !safeToRemove) return;
    if (!enabled) {
      safeToRemove();
      return;
    }
    const timer = window.setTimeout(safeToRemove, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, enabled, isPresent, safeToRemove]);

  return (
    <div
      {...props}
      className={clsx('orvilo-motion-scope', motionStyles.surface, className)}
      data-approval-exit={!isPresent || undefined}
      data-approval-motion-disabled={!enabled || undefined}
      ref={ref}
      style={{ '--approval-exit-scale': pill ? 0.9 : 0.96, ...style } as CSSProperties}
    />
  );
};

// Push below the desktop title bar; the web build has no title bar.
const TOP_OFFSET = isDesktop ? TITLE_BAR_HEIGHT + 8 : 16;

/**
 * GlobalApprovalNotification
 *
 * A "dynamic island" that drops in from the top center whenever a locally-driven
 * agent run in a non-active conversation is waiting for human approval. It lets
 * the user approve / reject inline — or jump to the conversation — without
 * leaving the current page. Renders nothing while idle.
 */
const GlobalApprovalNotification = memo(() => {
  const { t } = useTranslation('chat');
  const groups = useGlobalPendingApprovals();
  const [collapsed, setCollapsed] = useState(false);

  // Auto-expand whenever a fresh batch of approvals arrives after being idle.
  const prevCount = useRef(0);
  useEffect(() => {
    if (groups.length > prevCount.current) setCollapsed(false);
    prevCount.current = groups.length;
  }, [groups.length]);

  const hasApprovals = groups.length > 0;
  // Only ONE card is actionable at a time: the reused `ApprovalActions`
  // registers window-level Enter/1/2 shortcuts, so mounting a card per group
  // would let a single Enter submit every pending approval at once. Extra
  // approvals queue behind a count and surface as each one resolves.
  const top = groups[0];
  const extraCount = groups.length - 1;

  return (
    <div
      className={styles.wrapper}
      style={{ '--global-approval-top': `${TOP_OFFSET}px` } as CSSProperties}
    >
      <AnimatePresence mode="popLayout">
        {hasApprovals &&
          (collapsed ? (
            <ApprovalSurface
              {...clickableProps()}
              pill
              className={clsx(
                styles.pill,
                CLICKABLE_FOCUS_RING,
                '[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11',
              )}
              key="pill"
              onClick={() => setCollapsed(false)}
            >
              <span className={styles.pillDot} />
              {t('globalApproval.pendingCount', { count: groups.length })}
            </ApprovalSurface>
          ) : (
            <ApprovalSurface className={styles.stack} key="stack">
              <div className="pointer-events-auto self-end">
                <ActionIcon
                  icon={ChevronUp}
                  size={{ blockSize: 32, size: 16 }}
                  title={t('globalApproval.collapse')}
                  onClick={() => setCollapsed(true)}
                />
              </div>
              <AnimatePresence mode="popLayout">
                {top && (
                  <ApprovalSurface key={top.key} style={{ pointerEvents: 'auto', width: '100%' }}>
                    <ApprovalCard group={top} />
                  </ApprovalSurface>
                )}
              </AnimatePresence>
              {extraCount > 0 && (
                <div className={styles.moreHint}>
                  {t('globalApproval.moreCount', { count: extraCount })}
                </div>
              )}
            </ApprovalSurface>
          ))}
      </AnimatePresence>
    </div>
  );
});

GlobalApprovalNotification.displayName = 'GlobalApprovalNotification';

export default GlobalApprovalNotification;
