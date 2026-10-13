'use client';

import { useSyncExternalStore } from 'react';

import { useResolvedMotionValues } from '@/styles/themeRoles';

const QUERY = '(prefers-reduced-motion: reduce)';
const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const getSnapshot = () => window.matchMedia(QUERY).matches;
const getServerSnapshot = () => true;

export const resolveApprovalDuration = (enabled: boolean, duration: string, reduced: boolean) => {
  if (!enabled || reduced) return 0;
  const parsed = Number.parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export const useApprovalMotion = () => {
  const { enabled, durationMid } = useResolvedMotionValues();
  const reduced = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const durationMs = resolveApprovalDuration(enabled, durationMid, reduced);
  return { durationMs, enabled: durationMs > 0 };
};
