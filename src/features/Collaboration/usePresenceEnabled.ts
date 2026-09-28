'use client';

import { useServerConfigStore } from '@/store/serverConfig';
import { featureFlagsSelectors } from '@/store/serverConfig/selectors';

/**
 * `collaboration.presence` flag evaluation, split from the hook for testing.
 * The OSS schema has no such key yet, so read the runtime flags record
 * defensively. Absent means the flag simply isn't gated server-side yet —
 * presence stays enabled so the real channel is the only source of truth.
 * Explicit `false` disables everything, and nothing is ever simulated
 * locally either way.
 */
export const presenceFlagEnabled = (
  flags: Record<string, unknown>,
  explicit?: boolean,
): boolean => {
  if (explicit === false) return false;
  const flag = flags['collaboration.presence'] ?? flags['collaborationPresence'];
  return flag === undefined ? true : flag === true;
};

/**
 * Shared by every presence consumer (CollaborationProvider's cursor channel,
 * the top-bar avatar stack) so the flag gates all of them, not just one.
 */
export const usePresenceEnabled = (explicit?: boolean): boolean =>
  useServerConfigStore((s) =>
    presenceFlagEnabled(featureFlagsSelectors(s) as Record<string, unknown>, explicit),
  );
