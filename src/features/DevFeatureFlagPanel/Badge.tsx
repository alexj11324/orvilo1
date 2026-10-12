'use client';

import { memo } from 'react';

import { useServerConfigStore } from '@/store/serverConfig';

const styles = {
  badge:
    'inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-xs leading-5 font-semibold text-warning-text bg-warning-wash',
};

const FlagOverrideBadge = memo(() => {
  const overrideCount = useServerConfigStore((s) => Object.keys(s._featureFlagOverrides).length);
  if (overrideCount === 0) return null;
  return <span className={styles.badge}>{overrideCount}</span>;
});

FlagOverrideBadge.displayName = 'DevFeatureFlagPanel/Badge';

export default FlagOverrideBadge;
