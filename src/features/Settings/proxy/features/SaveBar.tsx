'use client';

import { AnimatePresence, useAnimationControls, usePresence } from 'motion/react';
import * as m from 'motion/react-m';
import {
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

// AppTheme's fast role is100ms in both agile and elegant modes: the actual
// motionBase0 + motionUnit0.05/0.1 producer emits(toFixed(1))0.1s.
// Keep this private feature's role independent of the retired theme hook.
const FAST_MOTION_DURATION_SECONDS = 0.1;

const styles = {
  container:
    'pointer-events-none fixed z-1000 inset-be-6 inset-x-0 mx-auto [inline-size:fit-content]',
  pill: 'pointer-events-auto inline-flex items-center gap-2 rounded-full border border-divider/60 bg-popover/85 py-1.5 ps-4 pe-1.5 text-sm text-foreground shadow-(--shadow-popover) backdrop-blur-[calc(var(--spacing)*4)] backdrop-saturate-[1.2]',
  dot: 'size-1.5 shrink-0 rounded-full bg-warning',
  message: 'text-muted-foreground',
};

interface SaveBarProps {
  isDirty: boolean;
  isSaving: boolean;
  onReset: () => void;
  onSave: () => void;
}

// Exiting presence children keep old props. Own the live motion subscriptions here
// so disabling motion also reaches a frame that is already leaving the tree.
const SaveBarMotionFrame = ({ children }: { children: ReactNode }) => {
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  const reduceMotion = useSyncExternalStore(
    useCallback((onChange: () => void) => {
      const query = window.matchMedia('(prefers-reduced-motion: reduce)');
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }, []),
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
  const disableMotion = animationMode === 'disabled' || reduceMotion;
  const controls = useAnimationControls();
  const [isPresent, safeToRemove] = usePresence();

  useLayoutEffect(() => {
    let active = true;
    controls.stop();

    if (disableMotion) {
      // Preserve the existing dirty DOM/focus; exiting frames can be removed now.
      controls.set({ opacity: 1, y: 0 });
    } else {
      void controls
        .start(
          { opacity: isPresent ? 1 : 0, y: isPresent ? 0 : 16 },
          { duration: FAST_MOTION_DURATION_SECONDS, ease: 'easeOut' },
        )
        .then(() => {
          if (active && !isPresent) safeToRemove?.();
        });
    }

    return () => {
      active = false;
      controls.stop();
    };
  }, [controls, disableMotion, isPresent, safeToRemove]);

  // AnimatePresence creates its exit-completion entry in the parent layout
  // effect. Notify in the passive phase, after that entry exists.
  useEffect(() => {
    if (disableMotion && !isPresent) safeToRemove?.();
  }, [disableMotion, isPresent, safeToRemove]);

  return (
    <m.div
      animate={controls}
      aria-live="polite"
      className={styles.container}
      initial={disableMotion ? false : { opacity: 0, y: 16 }}
      role="status"
    >
      {children}
    </m.div>
  );
};

const SaveBar = memo<SaveBarProps>(({ isDirty, isSaving, onReset, onSave }) => {
  const { t } = useTranslation('electron');

  return (
    <AnimatePresence>
      {isDirty && (
        <SaveBarMotionFrame key="save-bar">
          <div className={styles.pill}>
            <span className={styles.dot} />
            <span className={styles.message}>{t('proxy.unsavedChanges')}</span>
            <Button disabled={isSaving} size="normal" variant="ghost" onClick={onReset}>
              {t('proxy.resetButton')}
            </Button>
            <Button
              aria-busy={isSaving}
              disabled={isSaving}
              size="normal"
              variant="default"
              onClick={onSave}
            >
              {isSaving && <Spinner />}
              {t('proxy.saveButton')}
            </Button>
          </div>
        </SaveBarMotionFrame>
      )}
    </AnimatePresence>
  );
});

SaveBar.displayName = 'SaveBar';

export default SaveBar;
