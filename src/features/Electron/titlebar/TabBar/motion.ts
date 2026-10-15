import { type MotionValue, useSpring } from 'motion/react';
import { useCallback, useLayoutEffect, useSyncExternalStore } from 'react';

import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

/**
 * These five layout quantities share one duration-based spring, preserving the
 * allocator's common response instead of independently easing its geometry.
 * Compact titlebar state changes use DESIGN's 200ms mid role. No stiffness,
 * damping or mass is supplied: the public generator gives those physics keys
 * precedence over duration and would otherwise ignore the time role.
 */
export const TAB_SPRING = {
  bounce: 0,
  duration: 0.2,
  restDelta: 0.5,
  restSpeed: 2,
} as const;

export const useTabMotionDisabled = () => {
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  const reducedMotion = useSyncExternalStore(
    useCallback((notify: () => void) => {
      const query = window.matchMedia('(prefers-reduced-motion: reduce)');
      query.addEventListener('change', notify);
      return () => query.removeEventListener('change', notify);
    }, []),
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
  return animationMode === 'disabled' || reducedMotion;
};

// Five actual tab-layout values share the same public spring and cancellation contract.
// Jump also stops its passive follower. Snap to the latest source so a queued follower
// frame sees an equal target and cannot restart a disabled or unmounted animation.
export const useTabSpring = (source: MotionValue<number>, disabled: boolean) => {
  const spring = useSpring(source, TAB_SPRING);
  useLayoutEffect(() => {
    if (!disabled) return;
    spring.jump(source.get());
    return source.on('change', (latest) => spring.jump(latest));
  }, [disabled, source, spring]);
  useLayoutEffect(() => () => spring.jump(source.get()), [source, spring]);
  return spring;
};
